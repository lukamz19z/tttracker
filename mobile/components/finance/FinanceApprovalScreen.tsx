import { useCallback, useEffect, useMemo, useState } from "react";
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
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";

import { apiFetch } from "@/lib/api/client";
import {
  getApprovalDetail,
  reviewExpense,
  reviewInvoice,
} from "@/lib/api/approvals";
import { getMyFinanceDetail } from "@/lib/api/finance";
import type { FinanceDetailPayload, FinanceKind } from "@/types/finance";

const clean = (value: unknown) => String(value ?? "").trim();

const money = (value: unknown) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(Number(value ?? 0) || 0);

const date = (value: unknown) => {
  const raw = clean(value);
  if (!raw) return "—";

  const parsed = new Date(raw.length === 10 ? `${raw}T00:00:00` : raw);
  return Number.isNaN(parsed.getTime())
    ? raw
    : parsed.toLocaleDateString("en-AU");
};

function isReviewerAccessError(error: unknown) {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error ?? "").toLowerCase();

  return (
    message.includes("not configured to review") ||
    message.includes("not configured for this finance workflow") ||
    message.includes("finance workflow")
  );
}

export function FinanceApprovalScreen({
  kind,
  id,
}: {
  kind: FinanceKind;
  id: string;
}) {
  const [detail, setDetail] = useState<FinanceDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [comments, setComments] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const approvalDetail = await getApprovalDetail<FinanceDetailPayload>(
        kind,
        id,
      );
      setDetail(approvalDetail);
      return;
    } catch (approvalError) {
      if (!isReviewerAccessError(approvalError)) {
        setDetail(null);
        setError(
          approvalError instanceof Error
            ? approvalError.message
            : "Could not load Finance record.",
        );
        return;
      }

      try {
        const ownDetail = await getMyFinanceDetail(kind, id);
        setDetail(ownDetail);
        return;
      } catch (ownerError) {
        setDetail(null);
        setError(
          ownerError instanceof Error
            ? ownerError.message
            : "Could not load Finance record.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, [id, kind]);

  useEffect(() => {
    void load();
  }, [load]);

  const categoryById = useMemo(
    () =>
      new Map(
        (detail?.categories ?? []).map((category) => [
          category.id,
          category.name,
        ]),
      ),
    [detail?.categories],
  );

  const vehicleById = useMemo(
    () =>
      new Map(
        (detail?.vehicleAssets ?? []).map((asset) => [
          asset.id,
          [
            asset.vehicle_id,
            asset.vehicle_rego || asset.rego,
            [asset.make, asset.model].filter(Boolean).join(" "),
          ]
            .map(clean)
            .filter(Boolean)
            .join(" · ") || "Vehicle",
        ]),
      ),
    [detail?.vehicleAssets],
  );

  const plantById = useMemo(
    () =>
      new Map(
        (detail?.plantAssets ?? []).map((asset) => [
          asset.id,
          [
            asset.asset_id,
            asset.rego,
            asset.plant_type,
            [asset.make, asset.model].filter(Boolean).join(" "),
          ]
            .map(clean)
            .filter(Boolean)
            .join(" · ") || "Plant",
        ]),
      ),
    [detail?.plantAssets],
  );

  const fleetJobById = useMemo(
    () =>
      new Map(
        (detail?.fleetJobs ?? []).map((job) => [
          job.id,
          [job.job_number, job.asset_label]
            .map(clean)
            .filter(Boolean)
            .join(" · ") || "Fleet Job",
        ]),
      ),
    [detail?.fleetJobs],
  );

  async function runAction(
    next: "request_changes" | "deny" | "approve" | "mark_paid",
  ) {
    if (!detail || busy) return;

    if (
      (next === "request_changes" || next === "deny") &&
      !comments.trim()
    ) {
      Alert.alert(
        "Comment required",
        next === "deny"
          ? "Enter the reason for denial."
          : "Enter what needs to be changed.",
      );
      return;
    }

    const prompt =
      next === "approve"
        ? [
            "Approve submission?",
            "This records your approval in the same Finance workflow used by the website.",
            "Approve",
          ]
        : next === "request_changes"
          ? [
              "Request changes?",
              "The submitter will be sent back the required changes.",
              "Send Back",
            ]
          : next === "deny"
            ? [
                "Deny submission?",
                "This will reject the submitted Finance record.",
                "Deny",
              ]
            : [
                "Mark as paid?",
                "This records payment against the approved Finance record.",
                "Mark Paid",
              ];

    Alert.alert(prompt[0], prompt[1], [
      { text: "Cancel", style: "cancel" },
      {
        text: prompt[2],
        style: next === "deny" ? "destructive" : "default",
        onPress: () => void executeAction(next),
      },
    ]);
  }

  async function executeAction(
    next: "request_changes" | "deny" | "approve" | "mark_paid",
  ) {
    setBusy(next);
    setError(null);

    try {
      const result =
        kind === "expense"
          ? await reviewExpense(
              id,
              next,
              comments.trim(),
              paymentReference.trim(),
            )
          : await reviewInvoice(
              id,
              next,
              comments.trim(),
              paymentReference.trim(),
            );

      const value = (result ?? {}) as { warning?: string | null };

      Alert.alert(
        value.warning ? "Saved with warning" : "Saved",
        [
          next === "approve"
            ? "Approved successfully."
            : next === "request_changes"
              ? "Changes requested."
              : next === "deny"
                ? "Submission denied."
                : "Marked as paid.",
          value.warning ?? "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      );

      setComments("");
      await load();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Review action failed.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function openAttachment(row: Record<string, unknown>) {
    const attachmentId = clean(row.id);
    if (!attachmentId) return;

    setBusy(`file-${attachmentId}`);

    try {
      const response = await apiFetch(
        `/api/expenses/attachments/${encodeURIComponent(attachmentId)}/content`,
        { timeoutMs: 120_000 },
      );

      if (!response.ok) {
        const raw = await response.text();
        let message = "Attachment could not be opened.";

        if (raw.trim()) {
          try {
            const payload = JSON.parse(raw) as { error?: unknown };
            message = clean(payload.error) || message;
          } catch {
            message = raw.trim();
          }
        }

        throw new Error(message);
      }

      const bytes = new Uint8Array(await response.arrayBuffer());
      const fileName = (clean(row.file_name) || "attachment").replace(
        /[^a-zA-Z0-9._-]/g,
        "_",
      );

      const file = new File(Paths.cache, `${Date.now()}-${fileName}`);
      file.create({ overwrite: true, intermediates: true });
      file.write(bytes);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri);
      } else {
        Alert.alert(
          "File ready",
          "The attachment was downloaded but this device cannot open the share sheet.",
        );
      }
    } catch (fileError) {
      Alert.alert(
        "Could not open file",
        fileError instanceof Error ? fileError.message : "Please try again.",
      );
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  if (!detail) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.error}>{error || "Finance record not found."}</Text>
      </SafeAreaView>
    );
  }

  const submission = detail.submission;
  const status = clean(submission.status);
  const title =
    clean(submission.submission_number) ||
    (kind === "invoice" ? "Invoice" : "Expense Claim");

  const canReviewSubmitted =
    status === "submitted" &&
    (detail.capability.canReviewEdit || detail.capability.canApprove);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>
          {detail.readOnly
            ? kind === "invoice"
              ? "MY INVOICE"
              : "MY EXPENSE CLAIM"
            : kind === "invoice"
              ? "INVOICE APPROVAL"
              : "EXPENSE APPROVAL"}
        </Text>
        <Text style={styles.heading}>{title}</Text>

        {detail.readOnly ? (
          <View style={styles.readOnlyBanner}>
            <Text style={styles.readOnlyTitle}>Read-only view</Text>
            <Text style={styles.readOnlyText}>
              You can view your own Finance submission here. Approval actions
              are only shown to users configured in Finance Settings.
            </Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Info label="Status" value={status || "—"} />
          <Info
            label="Project"
            value={
              [detail.project?.project_number, detail.project?.name]
                .filter(Boolean)
                .join(" · ") || "General"
            }
          />

          {kind === "invoice" ? (
            <>
              <Info
                label="Supplier"
                value={clean(submission.supplier_name) || "—"}
              />
              <Info
                label="Invoice"
                value={clean(submission.invoice_number) || "—"}
              />
              <Info label="Due" value={date(submission.due_date)} />
            </>
          ) : (
            <Info
              label="Description"
              value={clean(submission.description) || "—"}
            />
          )}

          <Info label="Total" value={money(submission.total_amount)} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Cost Items</Text>

          {detail.items.map((row, index) => {
            const vehicleId = clean(row.vehicle_asset_id);
            const plantId = clean(row.plant_asset_id);
            const fleetJobId = clean(row.fleet_job_id);
            const projectId = clean(row.project_id);

            const allocation = fleetJobId
              ? `Fleet Job · ${fleetJobById.get(fleetJobId) || fleetJobId}`
              : vehicleId
                ? `Vehicle · ${vehicleById.get(vehicleId) || vehicleId}`
                : plantId
                  ? `Plant · ${plantById.get(plantId) || plantId}`
                  : projectId
                    ? `Project · ${
                        detail.project?.id === projectId
                          ? [
                              detail.project.project_number,
                              detail.project.name,
                            ]
                              .filter(Boolean)
                              .join(" · ")
                          : projectId
                      }`
                    : "General";

            return (
              <View key={clean(row.id) || String(index)} style={styles.item}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>
                    {clean(row.description) || `Item ${index + 1}`}
                  </Text>
                  <Text style={styles.muted}>
                    {categoryById.get(clean(row.category_id)) ||
                      "Uncategorised"}
                  </Text>
                  <Text style={styles.allocationText}>{allocation}</Text>
                </View>
                <Text style={styles.amount}>{money(row.amount_inc_gst)}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Attachments</Text>
          {detail.attachments.length === 0 ? (
            <Text style={styles.muted}>No attachments.</Text>
          ) : (
            detail.attachments.map((row) => (
              <Pressable
                key={clean(row.id)}
                style={styles.file}
                onPress={() => void openAttachment(row)}
              >
                <Text style={styles.itemTitle}>
                  {clean(row.file_name) || "Attachment"}
                </Text>
                <Text style={styles.link}>
                  {busy === `file-${clean(row.id)}` ? "Opening…" : "Open"}
                </Text>
              </Pressable>
            ))
          )}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {canReviewSubmitted ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Review</Text>

            <TextInput
              value={comments}
              onChangeText={setComments}
              placeholder="Comment / requested changes"
              multiline
              style={[
                styles.input,
                { minHeight: 100, textAlignVertical: "top" },
              ]}
            />

            <View style={styles.actions}>
              {detail.capability.canReviewEdit ? (
                <Pressable
                  disabled={!!busy}
                  style={[styles.button, styles.warn]}
                  onPress={() => void runAction("request_changes")}
                >
                  <Text style={styles.buttonText}>Request Changes</Text>
                </Pressable>
              ) : null}

              {detail.capability.canApprove ? (
                <Pressable
                  disabled={!!busy}
                  style={[styles.button, styles.danger]}
                  onPress={() => void runAction("deny")}
                >
                  <Text style={styles.buttonText}>Deny</Text>
                </Pressable>
              ) : null}

              {detail.capability.canApprove ? (
                <Pressable
                  disabled={!!busy}
                  style={[styles.button, styles.good]}
                  onPress={() => void runAction("approve")}
                >
                  <Text style={styles.buttonText}>Approve</Text>
                </Pressable>
              ) : null}
            </View>

            {busy ? <ActivityIndicator /> : null}
          </View>
        ) : null}

        {detail.capability.canMarkPaid && status === "approved" ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Payment</Text>
            <TextInput
              value={paymentReference}
              onChangeText={setPaymentReference}
              placeholder="Payment reference (optional)"
              style={styles.input}
            />
            <Pressable
              disabled={!!busy}
              style={[styles.button, styles.dark]}
              onPress={() => void runAction("mark_paid")}
            >
              <Text style={styles.buttonText}>Mark Paid</Text>
            </Pressable>
            {busy ? <ActivityIndicator /> : null}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.info}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f8fafc" },
  content: { padding: 18, gap: 14, paddingBottom: 40 },
  eyebrow: {
    fontSize: 12,
    fontWeight: "900",
    color: "#2563eb",
    letterSpacing: 1.2,
  },
  heading: { fontSize: 28, fontWeight: "900", color: "#0f172a" },
  readOnlyBanner: {
    padding: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
  },
  readOnlyTitle: {
    color: "#1d4ed8",
    fontWeight: "900",
  },
  readOnlyText: {
    marginTop: 3,
    color: "#475569",
    fontSize: 11,
    lineHeight: 16,
  },
  card: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 10,
  },
  cardTitle: { fontSize: 17, fontWeight: "900", color: "#0f172a" },
  info: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingVertical: 8,
  },
  label: { color: "#64748b", fontWeight: "700" },
  value: {
    flex: 1,
    textAlign: "right",
    color: "#0f172a",
    fontWeight: "800",
  },
  item: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  itemTitle: { fontWeight: "800", color: "#0f172a" },
  muted: { color: "#64748b", fontSize: 12, marginTop: 3 },
  allocationText: {
    color: "#2563eb",
    fontSize: 11,
    marginTop: 4,
    fontWeight: "700",
  },
  amount: { fontWeight: "900", color: "#0f172a" },
  file: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  link: { color: "#2563eb", fontWeight: "900" },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#fff",
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: {
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 11,
  },
  buttonText: { color: "#fff", fontWeight: "900" },
  warn: { backgroundColor: "#d97706" },
  danger: { backgroundColor: "#be123c" },
  good: { backgroundColor: "#047857" },
  dark: { backgroundColor: "#0f172a" },
  error: {
    margin: 18,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#fff1f2",
    color: "#be123c",
    fontWeight: "700",
  },
});

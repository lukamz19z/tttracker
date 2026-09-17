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
import { File, Paths } from "expo-file-system";
import {
  FileImage,
  FileText,
  Paperclip,
} from "lucide-react-native";

import {
  FinanceAttachmentPreview,
  type FinancePreviewFile,
} from "@/components/finance/FinanceAttachmentPreview";
import { apiFetch } from "@/lib/api/client";
import {
  getApprovalDetail,
  reviewExpense,
  reviewInvoice,
} from "@/lib/api/approvals";

type Kind = "expense" | "invoice";

type Detail = {
  kind: Kind;
  capability: {
    canReviewEdit?: boolean;
    canApprove?: boolean;
    canMarkPaid?: boolean;
  };
  submission: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
  attachments: Array<Record<string, unknown>>;
  categories: Array<{ id: string; name: string }>;
  project: {
    id: string;
    name: string;
    project_number: string | null;
  } | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function money(value: unknown) {
  const number = Number(value ?? 0);
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(Number.isFinite(number) ? number : 0);
}

function dateLabel(value: unknown) {
  const raw = clean(value);
  if (!raw) return "—";

  const date = new Date(
    raw.length === 10 ? `${raw}T00:00:00` : raw,
  );

  if (Number.isNaN(date.getTime())) return raw;

  return [
    String(date.getDate()).padStart(2, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getFullYear()),
  ].join("/");
}

function fileExtension(fileName: string) {
  return (
    clean(fileName)
      .toLowerCase()
      .match(/\.([a-z0-9]+)$/)?.[1] ?? ""
  );
}

function attachmentMime(row: Record<string, unknown>) {
  return (
    clean(row.mime_type) ||
    clean(row.mimeType) ||
    clean(row.content_type) ||
    clean(row.file_type) ||
    null
  );
}

function isImageAttachment(row: Record<string, unknown>) {
  const mime = clean(attachmentMime(row)).toLowerCase();
  const ext = fileExtension(clean(row.file_name));

  return (
    mime.startsWith("image/") ||
    ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(ext)
  );
}

function isPdfAttachment(row: Record<string, unknown>) {
  const mime = clean(attachmentMime(row)).toLowerCase();
  return mime.includes("pdf") || fileExtension(clean(row.file_name)) === "pdf";
}

function safeFileName(value: unknown) {
  const original = clean(value) || "attachment";
  return original.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function FinanceApprovalScreen({
  kind,
  id,
}: {
  kind: Kind;
  id: string;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [comments, setComments] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewFile, setPreviewFile] =
    useState<FinancePreviewFile | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setDetail(await getApprovalDetail<Detail>(kind, id));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load Finance record.",
      );
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

  async function action(
    next: "request_changes" | "deny" | "approve" | "mark_paid",
  ) {
    if (!detail) return;

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

    setBusy(next);
    setError(null);

    try {
      if (kind === "expense") {
        await reviewExpense(
          id,
          next,
          comments.trim(),
          paymentReference.trim(),
        );
      } else {
        await reviewInvoice(
          id,
          next,
          comments.trim(),
          paymentReference.trim(),
        );
      }

      Alert.alert(
        "Saved",
        next === "approve"
          ? "Approved successfully."
          : next === "request_changes"
            ? "Changes requested."
            : next === "deny"
              ? "Submission denied."
              : "Marked as paid.",
      );

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

  function closePreview() {
    if (previewLoading) return;
    setPreviewVisible(false);
    setPreviewFile(null);
  }

  async function openAttachment(row: Record<string, unknown>) {
    const attachmentId = clean(row.id);
    if (!attachmentId) return;

    const fileName = safeFileName(row.file_name);
    const rowMime = attachmentMime(row);

    setBusy(`file-${attachmentId}`);
    setPreviewFile({
      uri: "",
      name: fileName,
      mimeType: rowMime,
    });
    setPreviewVisible(true);
    setPreviewLoading(true);

    try {
      const response = await apiFetch(
        `/api/expenses/attachments/${encodeURIComponent(
          attachmentId,
        )}/content`,
        {
          timeoutMs: 120_000,
        },
      );

      if (!response.ok) {
        let message = "Attachment could not be opened.";

        try {
          const payload = (await response.json()) as {
            error?: string;
          };
          if (clean(payload.error)) {
            message = clean(payload.error);
          }
        } catch {
          // Response was not JSON. Use the default message.
        }

        throw new Error(message);
      }

      const responseMime =
        clean(response.headers.get("content-type")) || rowMime || undefined;

      const bytes = new Uint8Array(await response.arrayBuffer());
      const file = new File(
        Paths.cache,
        `${Date.now()}-${fileName}`,
      );

      file.create({
        overwrite: true,
        intermediates: true,
      });
      file.write(bytes);

      setPreviewFile({
        uri: file.uri,
        name: fileName,
        mimeType: responseMime,
      });
    } catch (attachmentError) {
      setPreviewVisible(false);
      setPreviewFile(null);

      Alert.alert(
        "Could not open file",
        attachmentError instanceof Error
          ? attachmentError.message
          : "Please try again.",
      );
    } finally {
      setPreviewLoading(false);
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

  if (!detail) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.error}>
          {error || "Finance record not found."}
        </Text>
      </SafeAreaView>
    );
  }

  const submission = detail.submission;
  const title =
    clean(submission.submission_number) ||
    (kind === "invoice" ? "Invoice" : "Expense Claim");

  const canReview =
    Boolean(detail.capability.canReviewEdit) ||
    Boolean(detail.capability.canApprove);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>
          {detail.capability.canApprove || detail.capability.canReviewEdit
            ? kind === "invoice"
              ? "INVOICE APPROVAL"
              : "EXPENSE APPROVAL"
            : kind === "invoice"
              ? "INVOICE"
              : "EXPENSE CLAIM"}
        </Text>

        <Text style={styles.heading}>{title}</Text>

        <View style={styles.card}>
          <Info
            label="Status"
            value={clean(submission.status) || "—"}
          />

          <Info
            label="Project"
            value={
              [
                detail.project?.project_number,
                detail.project?.name,
              ]
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
              <Info
                label="Invoice Date"
                value={dateLabel(submission.invoice_date)}
              />
              <Info
                label="Due"
                value={dateLabel(submission.due_date)}
              />
            </>
          ) : (
            <Info
              label="Description"
              value={clean(submission.description) || "—"}
            />
          )}

          <Info
            label="Total"
            value={money(submission.total_amount)}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Cost Items</Text>

          {detail.items.length === 0 ? (
            <Text style={styles.muted}>No cost items.</Text>
          ) : (
            detail.items.map((row, index) => (
              <View
                key={clean(row.id) || String(index)}
                style={styles.item}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>
                    {clean(row.description) || `Item ${index + 1}`}
                  </Text>

                  <Text style={styles.muted}>
                    {[
                      dateLabel(row.expense_date),
                      categoryById.get(clean(row.category_id)) ||
                        "Uncategorised",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </View>

                <Text style={styles.amount}>
                  {money(row.amount_inc_gst)}
                </Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Paperclip size={19} color="#0f172a" />
            <Text style={styles.cardTitle}>Attachments</Text>
            <View style={styles.attachmentCount}>
              <Text style={styles.attachmentCountText}>
                {detail.attachments.length}
              </Text>
            </View>
          </View>

          {detail.attachments.length === 0 ? (
            <Text style={styles.muted}>No attachments.</Text>
          ) : (
            detail.attachments.map((row) => {
              const attachmentId = clean(row.id);
              const fileName =
                clean(row.file_name) || "Attachment";
              const opening =
                busy === `file-${attachmentId}`;
              const pdf = isPdfAttachment(row);
              const image = isImageAttachment(row);

              return (
                <Pressable
                  key={attachmentId}
                  style={({ pressed }) => [
                    styles.file,
                    pressed && styles.filePressed,
                  ]}
                  disabled={opening}
                  onPress={() => void openAttachment(row)}
                >
                  <View
                    style={[
                      styles.fileIcon,
                      pdf && styles.fileIconPdf,
                      image && styles.fileIconImage,
                    ]}
                  >
                    {image ? (
                      <FileImage size={21} color="#2563eb" />
                    ) : (
                      <FileText
                        size={21}
                        color={pdf ? "#dc2626" : "#475569"}
                      />
                    )}
                  </View>

                  <View style={styles.fileCopy}>
                    <Text
                      numberOfLines={2}
                      style={styles.fileName}
                    >
                      {fileName}
                    </Text>

                    <Text style={styles.fileMeta}>
                      {pdf
                        ? "PDF document"
                        : image
                          ? "Image attachment"
                          : clean(row.attachment_type) ||
                            clean(row.document_type) ||
                            "Supporting document"}
                    </Text>
                  </View>

                  {opening ? (
                    <ActivityIndicator
                      size="small"
                      color="#2563eb"
                    />
                  ) : (
                    <View style={styles.viewButton}>
                      <Text style={styles.viewButtonText}>
                        {pdf ? "View PDF" : "View"}
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })
          )}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {canReview ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Review</Text>

            <TextInput
              value={comments}
              onChangeText={setComments}
              placeholder="Comment / requested changes"
              placeholderTextColor="#94a3b8"
              multiline
              style={[
                styles.input,
                {
                  minHeight: 100,
                  textAlignVertical: "top",
                },
              ]}
            />

            {detail.capability.canMarkPaid ? (
              <TextInput
                value={paymentReference}
                onChangeText={setPaymentReference}
                placeholder="Payment reference (for Mark Paid)"
                placeholderTextColor="#94a3b8"
                style={styles.input}
              />
            ) : null}

            <View style={styles.actions}>
              {detail.capability.canReviewEdit ? (
                <Pressable
                  disabled={Boolean(busy)}
                  style={[styles.button, styles.warn]}
                  onPress={() => void action("request_changes")}
                >
                  <Text style={styles.buttonText}>
                    Request Changes
                  </Text>
                </Pressable>
              ) : null}

              {detail.capability.canApprove ? (
                <Pressable
                  disabled={Boolean(busy)}
                  style={[styles.button, styles.danger]}
                  onPress={() => void action("deny")}
                >
                  <Text style={styles.buttonText}>Deny</Text>
                </Pressable>
              ) : null}

              {detail.capability.canApprove ? (
                <Pressable
                  disabled={Boolean(busy)}
                  style={[styles.button, styles.good]}
                  onPress={() => void action("approve")}
                >
                  <Text style={styles.buttonText}>Approve</Text>
                </Pressable>
              ) : null}

              {detail.capability.canMarkPaid &&
              clean(submission.status) === "approved" ? (
                <Pressable
                  disabled={Boolean(busy)}
                  style={[styles.button, styles.dark]}
                  onPress={() => void action("mark_paid")}
                >
                  <Text style={styles.buttonText}>
                    Mark Paid
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {busy && !busy.startsWith("file-") ? (
              <ActivityIndicator color="#2563eb" />
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <FinanceAttachmentPreview
        visible={previewVisible}
        loading={previewLoading}
        file={previewFile}
        onClose={closePreview}
      />
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
  safe: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  content: {
    padding: 18,
    paddingBottom: 40,
    gap: 14,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "900",
    color: "#2563eb",
    letterSpacing: 1.2,
  },
  heading: {
    fontSize: 28,
    fontWeight: "900",
    color: "#0f172a",
  },
  card: {
    backgroundColor: "#ffffff",
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 10,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: "#0f172a",
  },
  attachmentCount: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 7,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
  },
  attachmentCountText: {
    color: "#1d4ed8",
    fontSize: 11,
    fontWeight: "900",
  },
  info: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingVertical: 8,
  },
  label: {
    color: "#64748b",
    fontWeight: "700",
  },
  value: {
    flex: 1,
    textAlign: "right",
    color: "#0f172a",
    fontWeight: "800",
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  itemTitle: {
    fontWeight: "800",
    color: "#0f172a",
  },
  muted: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 3,
  },
  amount: {
    fontWeight: "900",
    color: "#0f172a",
  },
  file: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    backgroundColor: "#f8fafc",
  },
  filePressed: {
    opacity: 0.78,
  },
  fileIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f5f9",
  },
  fileIconPdf: {
    backgroundColor: "#fef2f2",
  },
  fileIconImage: {
    backgroundColor: "#eff6ff",
  },
  fileCopy: {
    flex: 1,
  },
  fileName: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "800",
  },
  fileMeta: {
    color: "#64748b",
    fontSize: 11,
    marginTop: 4,
  },
  viewButton: {
    minHeight: 36,
    borderRadius: 11,
    backgroundColor: "#2563eb",
    paddingHorizontal: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  viewButtonText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
  },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#ffffff",
    color: "#0f172a",
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  button: {
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 11,
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "900",
  },
  warn: {
    backgroundColor: "#d97706",
  },
  danger: {
    backgroundColor: "#be123c",
  },
  good: {
    backgroundColor: "#047857",
  },
  dark: {
    backgroundColor: "#0f172a",
  },
  error: {
    margin: 18,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#fff1f2",
    color: "#be123c",
    fontWeight: "700",
  },
});


import {
  Stack,
  useLocalSearchParams,
  useRouter,
  type Href,
} from "expo-router";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  FileText,
  RefreshCw,
  RotateCcw,
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
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  TrainingEvidencePreview,
  type TrainingPreviewFile,
} from "@/components/training/TrainingEvidencePreview";
import { apiFetch } from "@/lib/api/client";
import { getMyTraining } from "@/lib/api/training";
import type {
  TrainingDocument,
  TrainingPayload,
  TrainingRecord,
} from "@/types/training";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function dateLabel(value: string | null) {
  if (!value) return "—";

  const date = new Date(
    `${value.slice(0, 10)}T00:00:00`,
  );

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-AU", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

function workflowLabel(record: TrainingRecord) {
  if (record.workflow_status === "pending_review") {
    return "Pending Review";
  }
  if (record.workflow_status === "changes_required") {
    return "Changes Required";
  }
  if (record.workflow_status === "rejected") {
    return "Rejected";
  }
  if (record.workflow_status === "approved") {
    return "Approved";
  }
  return record.record_status || "Training Record";
}


export default function TrainingRecordScreen() {
  const router = useRouter();
  const params =
    useLocalSearchParams<{ recordId: string }>();
  const recordId = String(params.recordId ?? "");

  const [data, setData] =
    useState<TrainingPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] =
    useState<string | null>(null);
  const [error, setError] =
    useState<string | null>(null);

  const [preview, setPreview] =
    useState<TrainingPreviewFile | null>(null);
  const [previewVisible, setPreviewVisible] =
    useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setData(await getMyTraining());
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Training record could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const record = useMemo(
    () =>
      data?.records.find(
        (item) => item.id === recordId,
      ) ?? null,
    [data?.records, recordId],
  );

  const documents = useMemo(
    () =>
      (data?.documents ?? []).filter(
        (document) =>
          document.training_record_id ===
            recordId &&
          document.active !== false,
      ),
    [data?.documents, recordId],
  );

  async function previewDocument(
    document: TrainingDocument,
  ) {
    setOpening(document.id);
    setPreviewVisible(true);
    setPreview(null);

    try {
      /*
       * Ask TTTracker for a short-lived secure preview URL rather than
       * downloading the file through the API route.
       */
      const response = await apiFetch(
        `/api/training/documents/${encodeURIComponent(
          document.id,
        )}?mode=preview&_=${Date.now()}`,
        {
          timeoutMs: 120000,
        },
      );

      const raw = await response.text();

      let payload: {
        url?: string;
        fileName?: string;
        mimeType?: string;
        error?: string;
      } | null = null;

      if (raw) {
        try {
          payload = JSON.parse(raw) as {
            url?: string;
            fileName?: string;
            mimeType?: string;
            error?: string;
          };
        } catch {
          payload = null;
        }
      }

      if (!response.ok) {
        console.error(
          "Training evidence preview failed",
          {
            status: response.status,
            statusText:
              response.statusText,
            url: response.url,
            body: raw.slice(0, 1000),
            documentId: document.id,
          },
        );

        throw new Error(
          clean(payload?.error) ||
            `Training evidence could not be loaded (${response.status}).`,
        );
      }

      const secureUrl =
        clean(payload?.url);

      if (!secureUrl) {
        throw new Error(
          "TTTracker did not return a secure evidence URL.",
        );
      }

      setPreview({
        uri: secureUrl,
        name:
          clean(payload?.fileName) ||
          document.generated_file_name ||
          document.original_file_name ||
          "training-document",
        mimeType:
          clean(payload?.mimeType) ||
          (
            document as TrainingDocument & {
              mime_type?: string | null;
            }
          ).mime_type ||
          null,
      });
    } catch (openError) {
      setPreviewVisible(false);

      Alert.alert(
        "Could not preview evidence",
        openError instanceof Error
          ? openError.message
          : "Please try again.",
      );
    } finally {
      setOpening(null);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color="#2563eb"
        />
      </View>
    );
  }

  if (!record) {
    return (
      <View style={styles.center}>
        <AlertTriangle
          size={34}
          color="#94a3b8"
        />
        <Text style={styles.emptyTitle}>
          Training record not found
        </Text>
        <Text style={styles.error}>
          {error ??
            "This record may no longer be current."}
        </Text>
      </View>
    );
  }

  const needsChanges =
    record.workflow_status ===
    "changes_required";
  const rejected =
    record.workflow_status === "rejected" ||
    record.record_status === "rejected";

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title:
            record.training_short_code ||
            record.training_name,
        }}
      />

      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
      >
        <Pressable
          onPress={() => router.back()}
          style={styles.back}
        >
          <ArrowLeft
            size={17}
            color="#334155"
          />
          <Text style={styles.backText}>
            Back
          </Text>
        </Pressable>

        <View style={styles.hero}>
          <Text style={styles.kicker}>
            MY TRAINING
          </Text>
          <Text style={styles.title}>
            {record.training_name}
          </Text>
          <Text style={styles.status}>
            {workflowLabel(record)}
          </Text>
          {record.training_short_code ? (
            <Text style={styles.meta}>
              {record.training_short_code}
            </Text>
          ) : null}
        </View>

        {record.review_comment ? (
          <View
            style={[
              styles.notice,
              needsChanges || rejected
                ? styles.noticeWarn
                : styles.noticeInfo,
            ]}
          >
            <Text style={styles.noticeTitle}>
              {needsChanges
                ? "Changes required"
                : rejected
                  ? "Reviewer reason"
                  : "Reviewer comment"}
            </Text>
            <Text style={styles.noticeText}>
              {record.review_comment}
            </Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Info
            label="Certificate / Licence No."
            value={
              record.certificate_number || "—"
            }
          />
          <Info
            label="Provider / Issuer"
            value={
              record.provider ||
              record.issuing_authority ||
              "—"
            }
          />
          <Info
            label="Issue Date"
            value={dateLabel(record.issue_date)}
          />
          <Info
            label="Expiry"
            value={
              record.does_not_expire
                ? "Does not expire"
                : dateLabel(record.expiry_date)
            }
          />
          <Info
            label="Classes / Endorsements"
            value={
              (
                record.option_codes?.length
                  ? record.option_codes
                  : record.class_codes ?? []
              ).join(", ") || "—"
            }
          />
          <Info
            label="Submitted"
            value={
              record.submitted_at
                ? new Date(
                    record.submitted_at,
                  ).toLocaleString("en-AU")
                : "—"
            }
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            Evidence
          </Text>

          <Text style={styles.sectionHelp}>
            Tap Preview to inspect the exact evidence
            attached to this Training record.
          </Text>

          {documents.length === 0 ? (
            <Text style={styles.meta}>
              No evidence is attached to this record.
            </Text>
          ) : (
            documents.map((document) => (
              <Pressable
                key={document.id}
                style={styles.document}
                onPress={() =>
                  void previewDocument(document)
                }
                disabled={
                  opening === document.id
                }
              >
                <FileText
                  size={20}
                  color="#2563eb"
                />

                <View style={{ flex: 1 }}>
                  <Text
                    style={styles.documentName}
                  >
                    {document.generated_file_name ||
                      document.original_file_name ||
                      "Training evidence"}
                  </Text>
                  <Text style={styles.meta}>
                    {document.document_side ||
                      "Document"}
                  </Text>
                </View>

                {opening === document.id ? (
                  <ActivityIndicator />
                ) : (
                  <View style={styles.previewAction}>
                    <Eye
                      size={15}
                      color="#2563eb"
                    />
                    <Text style={styles.openText}>
                      Preview
                    </Text>
                  </View>
                )}
              </Pressable>
            ))
          )}
        </View>

        {needsChanges ? (
          <Pressable
            style={styles.primary}
            onPress={() =>
              router.push(
                `/training/upload?changesRecordId=${encodeURIComponent(
                  record.id,
                )}&trainingTypeId=${encodeURIComponent(
                  record.training_type_id ?? "",
                )}` as Href,
              )
            }
          >
            <RotateCcw
              size={19}
              color="#fff"
            />
            <Text style={styles.primaryText}>
              Fix Submission
            </Text>
          </Pressable>
        ) : rejected ? (
          <Pressable
            style={styles.primary}
            onPress={() =>
              router.push(
                `/training/upload?trainingTypeId=${encodeURIComponent(
                  record.training_type_id ?? "",
                )}` as Href,
              )
            }
          >
            <RefreshCw
              size={19}
              color="#fff"
            />
            <Text style={styles.primaryText}>
              Upload New Certificate
            </Text>
          </Pressable>
        ) : record.workflow_status ===
          "approved" ? (
          <Pressable
            style={styles.primary}
            onPress={() =>
              router.push(
                `/training/upload?trainingTypeId=${encodeURIComponent(
                  record.training_type_id ?? "",
                )}&replaceRecordId=${encodeURIComponent(
                  record.id,
                )}` as Href,
              )
            }
          >
            <CheckCircle2
              size={19}
              color="#fff"
            />
            <Text style={styles.primaryText}>
              Upload Renewal
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <TrainingEvidencePreview
        file={preview}
        visible={previewVisible}
        loading={Boolean(opening) && !preview}
        onClose={() => {
          setPreviewVisible(false);
          setPreview(null);
        }}
      />
    </>
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
      <Text style={styles.infoLabel}>
        {label}
      </Text>
      <Text style={styles.infoValue}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 14,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 25,
    backgroundColor: "#f8fafc",
  },
  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  backText: {
    color: "#334155",
    fontWeight: "800",
  },
  hero: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 22,
    padding: 18,
  },
  kicker: {
    color: "#2563eb",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  title: {
    marginTop: 5,
    color: "#0f172a",
    fontSize: 24,
    fontWeight: "900",
  },
  status: {
    marginTop: 8,
    color: "#2563eb",
    fontWeight: "900",
    fontSize: 13,
  },
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  info: {
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingBottom: 10,
  },
  infoLabel: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  infoValue: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "800",
    marginTop: 4,
  },
  sectionTitle: {
    color: "#0f172a",
    fontWeight: "900",
    fontSize: 16,
  },
  sectionHelp: {
    color: "#64748b",
    fontSize: 11,
    lineHeight: 17,
  },
  meta: {
    color: "#64748b",
    fontSize: 11,
    marginTop: 4,
  },
  document: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 13,
    padding: 12,
  },
  documentName: {
    color: "#0f172a",
    fontWeight: "800",
    fontSize: 12,
  },
  previewAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  openText: {
    color: "#2563eb",
    fontSize: 11,
    fontWeight: "900",
  },
  notice: {
    borderRadius: 16,
    padding: 15,
    borderWidth: 1,
  },
  noticeWarn: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
  },
  noticeInfo: {
    backgroundColor: "#eff6ff",
    borderColor: "#bfdbfe",
  },
  noticeTitle: {
    color: "#0f172a",
    fontWeight: "900",
  },
  noticeText: {
    color: "#475569",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  primary: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#2563eb",
    borderRadius: 16,
    padding: 15,
  },
  primaryText: {
    color: "#fff",
    fontWeight: "900",
  },
  emptyTitle: {
    color: "#0f172a",
    fontWeight: "900",
    marginTop: 10,
  },
  error: {
    color: "#64748b",
    textAlign: "center",
    marginTop: 5,
  },
});

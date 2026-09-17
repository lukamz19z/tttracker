
import { router, type Href } from "expo-router";
import {
  ClipboardCheck,
  FileText,
  ReceiptText,
} from "lucide-react-native";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { AppFooter } from "@/components/common/AppFooter";
import { useAccess } from "@/lib/access";
import {
  getMyApprovals,
  type ApprovalListPayload,
  type FinanceApprovalCapability,
} from "@/lib/api/approvals";

type Item = Record<string, unknown>;

const clean = (value: unknown) => String(value ?? "").trim();

const money = (value: unknown) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(Number(value ?? 0) || 0);

function relationObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === "object"
      ? (first as Record<string, unknown>)
      : null;
  }
  return typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function hasFinanceAuthority(
  capability: FinanceApprovalCapability | undefined,
) {
  return Boolean(
    capability?.canReviewEdit ||
      capability?.canApprove ||
      capability?.canMarkPaid,
  );
}

export default function ApprovalsScreen() {
  const { capabilities } = useAccess();
  const [data, setData] = useState<ApprovalListPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await getMyApprovals());
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Approvals could not be loaded.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const showDailyDockets =
    (data?.capabilities.dailyDockets.projectIds.length ?? 0) > 0;
  const showExpenses = hasFinanceAuthority(data?.capabilities.expense);
  const showInvoices = hasFinanceAuthority(data?.capabilities.invoice);

  const serverHasApprovals =
    showDailyDockets || showExpenses || showInvoices;

  const open = (path: string) => router.push(path as Href);

  const pendingTotal = useMemo(
    () =>
      (data?.dailyDockets.length ?? 0) +
      (data?.expenseClaims.length ?? 0) +
      (data?.invoices.length ?? 0),
    [data],
  );

  if (!capabilities.hasApprovals && !loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.empty}>
          <ClipboardCheck size={36} color="#94a3b8" />
          <Text style={styles.title}>No approval workflows assigned</Text>
          <Text style={styles.muted}>
            Daily Docket and Finance approval authority are configured
            independently in TTTracker website settings.
          </Text>
          <AppFooter />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
        contentContainerStyle={styles.content}
      >
        <Text style={styles.eyebrow}>WORKFLOW</Text>
        <Text style={styles.heading}>My Approvals</Text>
        <Text style={styles.muted}>
          Each section is shown only when your account is configured for that
          approval workflow.
        </Text>

        {!loading && serverHasApprovals ? (
          <View style={styles.summary}>
            <Text style={styles.summaryLabel}>WAITING FOR YOU</Text>
            <Text style={styles.summaryValue}>{pendingTotal}</Text>
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} />
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {!loading && !error && !serverHasApprovals ? (
          <View style={styles.emptyCard}>
            <Text style={styles.none}>
              Your approval configuration changed. Pull to refresh or reopen
              the app to refresh your access.
            </Text>
          </View>
        ) : null}

        {showDailyDockets ? (
          <ApprovalSection
            title="Daily Dockets"
            icon={<ClipboardCheck size={20} color="#2563eb" />}
            rows={data?.dailyDockets ?? []}
            onPress={(row) =>
              open(
                `/approvals/dockets/${encodeURIComponent(clean(row.id))}`,
              )
            }
            render={(row) => {
              const tower = relationObject(row.towers);
              const project = relationObject(row.projects);

              return {
                title:
                  clean(tower?.name) ||
                  clean(row.tower_name) ||
                  clean(row.tower_id) ||
                  "Daily Docket",
                subtitle: [
                  clean(project?.name) || clean(project?.project_number),
                  clean(row.docket_date),
                  clean(row.approval_status),
                ]
                  .filter(Boolean)
                  .join(" · "),
              };
            }}
          />
        ) : null}

        {showExpenses ? (
          <ApprovalSection
            title="Expense Claims"
            icon={<ReceiptText size={20} color="#2563eb" />}
            rows={data?.expenseClaims ?? []}
            onPress={(row) =>
              open(
                `/approvals/expenses/${encodeURIComponent(clean(row.id))}`,
              )
            }
            render={(row) => ({
              title: clean(row.submission_number) || "Expense Claim",
              subtitle: `${
                clean(row.description) || "Claim"
              } · ${money(row.total_amount)}`,
            })}
          />
        ) : null}

        {showInvoices ? (
          <ApprovalSection
            title="Invoices"
            icon={<FileText size={20} color="#2563eb" />}
            rows={data?.invoices ?? []}
            onPress={(row) =>
              open(
                `/approvals/invoices/${encodeURIComponent(clean(row.id))}`,
              )
            }
            render={(row) => ({
              title:
                clean(row.submission_number) ||
                clean(row.invoice_number) ||
                "Invoice",
              subtitle: `${
                clean(row.supplier_name) || "Supplier"
              } · ${money(row.total_amount)}`,
            })}
          />
        ) : null}

        <AppFooter />
      </ScrollView>
    </SafeAreaView>
  );
}

function ApprovalSection({
  title,
  icon,
  rows,
  onPress,
  render,
}: {
  title: string;
  icon: ReactNode;
  rows: Item[];
  onPress: (row: Item) => void;
  render: (row: Item) => { title: string; subtitle: string };
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        {icon}
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.count}>{rows.length}</Text>
      </View>

      {rows.length === 0 ? (
        <Text style={styles.none}>Nothing waiting for you.</Text>
      ) : (
        rows.map((row, index) => {
          const display = render(row);

          return (
            <Pressable
              key={clean(row.id) || String(index)}
              onPress={() => onPress(row)}
              style={styles.row}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{display.title}</Text>
                <Text style={styles.rowSubtitle}>{display.subtitle}</Text>
              </View>
              <Text style={styles.open}>Open ›</Text>
            </Pressable>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f8fafc" },
  content: { padding: 18, gap: 14, paddingBottom: 32 },
  eyebrow: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.2,
    color: "#2563eb",
  },
  heading: { fontSize: 30, fontWeight: "900", color: "#0f172a" },
  title: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0f172a",
    marginTop: 12,
    textAlign: "center",
  },
  muted: { color: "#64748b", lineHeight: 20 },
  error: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#fff1f2",
    color: "#be123c",
    fontWeight: "700",
  },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#dbeafe",
    backgroundColor: "#eff6ff",
    borderRadius: 16,
    padding: 14,
  },
  summaryLabel: {
    color: "#2563eb",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  summaryValue: {
    color: "#0f172a",
    fontSize: 24,
    fontWeight: "900",
  },
  section: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 18,
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 15,
    borderBottomWidth: 1,
    borderColor: "#e2e8f0",
  },
  sectionTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "900",
    color: "#0f172a",
  },
  count: {
    minWidth: 28,
    textAlign: "center",
    paddingVertical: 3,
    borderRadius: 99,
    backgroundColor: "#eff6ff",
    color: "#1d4ed8",
    fontWeight: "900",
  },
  none: { padding: 18, color: "#94a3b8", fontWeight: "600" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 15,
    borderBottomWidth: 1,
    borderColor: "#f1f5f9",
  },
  rowTitle: { fontWeight: "900", color: "#0f172a" },
  rowSubtitle: {
    marginTop: 4,
    color: "#64748b",
    fontSize: 12,
  },
  open: { color: "#2563eb", fontWeight: "900" },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
  },
  emptyCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 16,
  },
});

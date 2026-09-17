import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { router, type Href } from "expo-router";
import { useEffect, useMemo, useState } from "react";
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

import {
  FinancePicker,
  type FinancePickerOption,
} from "@/components/finance/FinancePicker";
import {
  financeFleetJobLabel,
  financePlantLabel,
  financeVehicleLabel,
  getMyFinance,
  saveFinanceDraft,
  submitExpenseClaim,
  submitInvoice,
  uploadExpenseReceipt,
  uploadInvoiceDocument,
  type PickedFinanceFile,
} from "@/lib/api/finance";
import type {
  FinanceAllocationType,
  FinancePayload,
} from "@/types/finance";

type Kind = "expense" | "invoice";

type Line = {
  description: string;
  categoryId: string;
  expenseDate: string;
  amountIncGst: string;
  gstAmount: string;
  notes: string;
  allocationType: FinanceAllocationType;
  projectId: string;
  vehicleAssetId: string;
  plantAssetId: string;
  fleetJobId: string;
  receipt: PickedFinanceFile | null;
};

type SubmitResult = {
  warning?: string | null;
  reviewers?: number;
  channels?: {
    inAppCreated?: number;
    emailsSent?: number;
    pushAttempted?: number;
  };
};

const today = () => new Date().toISOString().slice(0, 10);

const emptyLine = (): Line => ({
  description: "",
  categoryId: "",
  expenseDate: today(),
  amountIncGst: "",
  gstAmount: "",
  notes: "",
  allocationType: "project",
  projectId: "",
  vehicleAssetId: "",
  plantAssetId: "",
  fleetJobId: "",
  receipt: null,
});

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function projectOptions(data: FinancePayload | null): FinancePickerOption[] {
  return (data?.projects ?? []).map((project) => ({
    value: project.id,
    label:
      [project.project_number, project.name].filter(Boolean).join(" · ") ||
      "Project",
  }));
}

export function FinanceDraftForm({ kind }: { kind: Kind }) {
  const [reference, setReference] = useState<FinancePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [projectId, setProjectId] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");

  const [supplierName, setSupplierName] = useState("");
  const [supplierAbn, setSupplierAbn] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [receivedDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState("");

  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [invoiceFile, setInvoiceFile] =
    useState<PickedFinanceFile | null>(null);

  useEffect(() => {
    void getMyFinance(
      kind === "expense" ? "expense_claim" : "invoice",
    )
      .then(setReference)
      .catch((error) =>
        Alert.alert(
          "Could not load Finance",
          error instanceof Error ? error.message : "Please try again.",
        ),
      )
      .finally(() => setLoading(false));
  }, [kind]);

  const total = useMemo(
    () =>
      lines.reduce(
        (sum, row) => sum + (Number(row.amountIncGst) || 0),
        0,
      ),
    [lines],
  );

  const projects = useMemo(
    () => projectOptions(reference),
    [reference],
  );

  const categories = useMemo(
    () =>
      (reference?.categories ?? [])
        .filter((category) => category.active)
        .map((category) => ({
          value: category.id,
          label: category.name,
        })),
    [reference?.categories],
  );

  const vehicles = useMemo(
    () =>
      (reference?.vehicleAssets ?? []).map((asset) => ({
        value: asset.id,
        label: financeVehicleLabel(asset),
        subtitle: clean(asset.category || asset.status),
      })),
    [reference?.vehicleAssets],
  );

  const plant = useMemo(
    () =>
      (reference?.plantAssets ?? []).map((asset) => ({
        value: asset.id,
        label: financePlantLabel(asset),
        subtitle: clean(asset.asset_status),
      })),
    [reference?.plantAssets],
  );

  const fleetJobs = useMemo(
    () =>
      (reference?.fleetJobs ?? []).map((job) => ({
        value: job.id,
        label: financeFleetJobLabel(job),
        subtitle: clean(job.asset_type),
      })),
    [reference?.fleetJobs],
  );

  function patchLine(index: number, patch: Partial<Line>) {
    setLines((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
  }

  function changeAllocationType(
    index: number,
    allocationType: FinanceAllocationType,
  ) {
    patchLine(index, {
      allocationType,
      projectId:
        allocationType === "project"
          ? kind === "invoice"
            ? projectId
            : ""
          : "",
      vehicleAssetId: "",
      plantAssetId: "",
      fleetJobId: "",
    });
  }

  async function pickFile(
    source: "camera" | "file",
  ): Promise<PickedFinanceFile | null> {
    if (source === "camera") {
      const permission = await ImagePicker.requestCameraPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Camera permission required",
          "Allow camera access to photograph the receipt.",
        );
        return null;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.8,
      });

      if (result.canceled) return null;

      const asset = result.assets[0];

      return {
        uri: asset.uri,
        name: asset.fileName || `receipt-${Date.now()}.jpg`,
        mimeType: asset.mimeType || "image/jpeg",
      };
    }

    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: ["application/pdf", "image/*"],
    });

    if (result.canceled) return null;

    const asset = result.assets[0];

    return {
      uri: asset.uri,
      name: asset.name || `document-${Date.now()}`,
      mimeType: asset.mimeType || "application/octet-stream",
    };
  }

  function validate(submit: boolean) {
    if (!lines.length) return "Add at least one Finance item.";

    for (let index = 0; index < lines.length; index += 1) {
      const row = lines[index];
      const item = kind === "invoice" ? "Allocation" : "Item";

      if (!row.description.trim()) {
        return `${item} ${index + 1}: enter a description.`;
      }

      if (!(Number(row.amountIncGst) > 0)) {
        return `${item} ${index + 1}: enter an amount greater than $0.`;
      }

      if (!row.categoryId) {
        return `${item} ${index + 1}: select a category.`;
      }

      if (
        row.allocationType === "project" &&
        !(kind === "expense" ? projectId : row.projectId || projectId)
      ) {
        return `${item} ${index + 1}: select the project.`;
      }

      if (
        row.allocationType === "vehicle" &&
        !row.vehicleAssetId
      ) {
        return `${item} ${index + 1}: select a vehicle.`;
      }

      if (
        row.allocationType === "plant" &&
        !row.plantAssetId
      ) {
        return `${item} ${index + 1}: select a plant asset.`;
      }

      if (
        row.allocationType === "fleet_job" &&
        !row.fleetJobId
      ) {
        return `${item} ${index + 1}: select a Fleet Job.`;
      }

      if (kind === "expense" && !row.expenseDate) {
        return `Item ${index + 1}: enter the expense date.`;
      }

      if (kind === "expense" && submit && !row.receipt) {
        return `Item ${index + 1}: photograph or attach the receipt before submitting.`;
      }
    }

    if (kind === "invoice" && !supplierName.trim()) {
      return "Enter the supplier name.";
    }

    if (kind === "invoice" && submit && !invoiceFile) {
      return "Attach the original supplier Invoice before submitting.";
    }

    return null;
  }

  function notificationSummary(result: unknown) {
    const value = (result ?? {}) as SubmitResult;
    const parts: string[] = [];

    if (typeof value.reviewers === "number") {
      parts.push(`${value.reviewers} reviewer(s)`);
    }
    if (typeof value.channels?.inAppCreated === "number") {
      parts.push(`${value.channels.inAppCreated} in-app`);
    }
    if (typeof value.channels?.emailsSent === "number") {
      parts.push(`${value.channels.emailsSent} email`);
    }
    if (typeof value.channels?.pushAttempted === "number") {
      parts.push(`${value.channels.pushAttempted} push`);
    }

    return {
      detail: parts.join(" · "),
      warning: value.warning ?? null,
    };
  }

  async function save(submit: boolean) {
    const validationError = validate(submit);

    if (validationError) {
      Alert.alert("Check Finance submission", validationError);
      return;
    }

    setSaving(true);

    try {
      const draft = await saveFinanceDraft({
        type: kind === "expense" ? "expense_claim" : "invoice",
        projectId,
        description,
        notes,
        supplierName,
        supplierAbn,
        invoiceNumber,
        invoiceDate,
        receivedDate,
        dueDate,
        purchaseOrderNumber,
        allocations: lines.map((row) => ({
          categoryId: row.categoryId,
          expenseDate: row.expenseDate,
          description: row.description,
          amountIncGst: Number(row.amountIncGst) || 0,
          gstAmount: Number(row.gstAmount) || 0,
          notes: row.notes,
          allocationType: row.allocationType,
          projectId:
            row.allocationType === "project"
              ? row.projectId || projectId
              : "",
          vehicleAssetId: row.vehicleAssetId,
          plantAssetId: row.plantAssetId,
          fleetJobId: row.fleetJobId,
        })),
      });

      if (kind === "expense") {
        for (let index = 0; index < draft.items.length; index += 1) {
          const receipt = lines[index]?.receipt;
          if (!receipt) continue;

          await uploadExpenseReceipt({
            submissionId: draft.submissionId,
            itemId: draft.items[index].id,
            file: receipt,
          });
        }
      } else if (invoiceFile) {
        await uploadInvoiceDocument({
          submissionId: draft.submissionId,
          file: invoiceFile,
          documentType: "invoice",
        });
      }

      if (!submit) {
        Alert.alert(
          "Draft saved",
          kind === "expense"
            ? "Expense Claim saved as a draft."
            : "Invoice saved as a draft.",
          [
            {
              text: "OK",
              onPress: () =>
                router.replace(
                  (kind === "expense"
                    ? "/(drawer)/expenses"
                    : "/(drawer)/invoices") as Href,
                ),
            },
          ],
        );
        return;
      }

      const submitResult =
        kind === "expense"
          ? await submitExpenseClaim(draft.submissionId)
          : await submitInvoice(draft.submissionId);

      const summary = notificationSummary(submitResult);

      Alert.alert(
        summary.warning ? "Submitted with warning" : "Submitted",
        [
          kind === "expense"
            ? "Expense Claim submitted for approval."
            : "Invoice submitted for approval.",
          summary.detail,
          summary.warning,
        ]
          .filter(Boolean)
          .join("\n\n"),
        [
          {
            text: "OK",
            onPress: () =>
              router.replace(
                (kind === "expense"
                  ? "/(drawer)/expenses"
                  : "/(drawer)/invoices") as Href,
              ),
          },
        ],
      );
    } catch (error) {
      Alert.alert(
        "Could not save",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.eyebrow}>FINANCE</Text>
        <Text style={styles.heading}>
          {kind === "expense" ? "New Expense Claim" : "New Invoice"}
        </Text>
        <Text style={styles.muted}>
          Project, asset and Fleet Job allocations use the same Finance fields
          as the TTTracker website.
        </Text>

        <Card title="General">
          <FinancePicker
            label="Primary Project"
            value={projectId}
            options={projects}
            onChange={(value) => {
              setProjectId(value);
              if (kind === "invoice") {
                setLines((current) =>
                  current.map((row) =>
                    row.allocationType === "project" && !row.projectId
                      ? { ...row, projectId: value }
                      : row,
                  ),
                );
              }
            }}
            placeholder="Company / General"
            noneLabel="Company / General"
          />

          {kind === "invoice" ? (
            <>
              <Field label="Supplier">
                <TextInput
                  style={styles.input}
                  value={supplierName}
                  onChangeText={setSupplierName}
                />
              </Field>
              <Field label="Supplier ABN">
                <TextInput
                  style={styles.input}
                  value={supplierAbn}
                  onChangeText={setSupplierAbn}
                />
              </Field>
              <Field label="Invoice Number">
                <TextInput
                  style={styles.input}
                  value={invoiceNumber}
                  onChangeText={setInvoiceNumber}
                />
              </Field>
              <View style={styles.two}>
                <Field label="Invoice Date">
                  <TextInput
                    style={styles.input}
                    value={invoiceDate}
                    onChangeText={setInvoiceDate}
                    placeholder="YYYY-MM-DD"
                  />
                </Field>
                <Field label="Due Date">
                  <TextInput
                    style={styles.input}
                    value={dueDate}
                    onChangeText={setDueDate}
                    placeholder="YYYY-MM-DD"
                  />
                </Field>
              </View>
              <Field label="Purchase Order">
                <TextInput
                  style={styles.input}
                  value={purchaseOrderNumber}
                  onChangeText={setPurchaseOrderNumber}
                />
              </Field>

              <View style={styles.fileBlock}>
                <Text style={styles.fieldLabel}>Original Supplier Invoice</Text>
                <Pressable
                  style={styles.fileButton}
                  onPress={async () =>
                    setInvoiceFile(await pickFile("file"))
                  }
                >
                  <Text style={styles.fileButtonText}>
                    {invoiceFile ? invoiceFile.name : "Choose PDF / Image"}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : null}

          <Field label="Description">
            <TextInput
              style={styles.input}
              value={description}
              onChangeText={setDescription}
            />
          </Field>

          <Field label="Notes">
            <TextInput
              style={[styles.input, styles.notes]}
              multiline
              value={notes}
              onChangeText={setNotes}
            />
          </Field>
        </Card>

        <Card title={kind === "expense" ? "Expense Items" : "Cost Allocations"}>
          {lines.map((row, index) => (
            <View key={index} style={styles.line}>
              <View style={styles.lineHeader}>
                <Text style={styles.lineTitle}>
                  {kind === "expense" ? "Item" : "Allocation"} {index + 1}
                </Text>
                {lines.length > 1 ? (
                  <Pressable
                    onPress={() =>
                      setLines((current) =>
                        current.filter(
                          (_candidate, rowIndex) => rowIndex !== index,
                        ),
                      )
                    }
                  >
                    <Text style={styles.remove}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>

              <Field label="Description">
                <TextInput
                  style={styles.input}
                  value={row.description}
                  onChangeText={(value) =>
                    patchLine(index, { description: value })
                  }
                />
              </Field>

              <FinancePicker
                label="Category"
                value={row.categoryId}
                options={categories}
                onChange={(value) =>
                  patchLine(index, { categoryId: value })
                }
                allowNone={false}
                placeholder="Select category"
              />

              <Text style={styles.fieldLabel}>Allocation Type</Text>
              <View style={styles.allocationTypes}>
                {(
                  [
                    ["general", "General"],
                    ["project", "Project"],
                    ["vehicle", "Vehicle"],
                    ["plant", "Plant"],
                    ["fleet_job", "Fleet Job"],
                  ] as const
                ).map(([value, label]) => (
                  <Pressable
                    key={value}
                    style={[
                      styles.allocationChip,
                      row.allocationType === value &&
                        styles.allocationChipActive,
                    ]}
                    onPress={() =>
                      changeAllocationType(index, value)
                    }
                  >
                    <Text
                      style={[
                        styles.allocationChipText,
                        row.allocationType === value &&
                          styles.allocationChipTextActive,
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {row.allocationType === "project" ? (
                kind === "expense" ? (
                  <View style={styles.contextBox}>
                    <Text style={styles.contextText}>
                      Uses Primary Project:{" "}
                      {projects.find((option) => option.value === projectId)
                        ?.label || "Not selected"}
                    </Text>
                  </View>
                ) : (
                  <FinancePicker
                    label="Project"
                    value={row.projectId || projectId}
                    options={projects}
                    onChange={(value) =>
                      patchLine(index, { projectId: value })
                    }
                    allowNone={false}
                    placeholder="Select project"
                  />
                )
              ) : null}

              {row.allocationType === "vehicle" ? (
                <FinancePicker
                  label="Vehicle"
                  value={row.vehicleAssetId}
                  options={vehicles}
                  onChange={(value) =>
                    patchLine(index, { vehicleAssetId: value })
                  }
                  allowNone={false}
                  placeholder="Search vehicle"
                />
              ) : null}

              {row.allocationType === "plant" ? (
                <FinancePicker
                  label="Plant"
                  value={row.plantAssetId}
                  options={plant}
                  onChange={(value) =>
                    patchLine(index, { plantAssetId: value })
                  }
                  allowNone={false}
                  placeholder="Search plant asset"
                />
              ) : null}

              {row.allocationType === "fleet_job" ? (
                <FinancePicker
                  label="Fleet Job"
                  value={row.fleetJobId}
                  options={fleetJobs}
                  onChange={(value) =>
                    patchLine(index, { fleetJobId: value })
                  }
                  allowNone={false}
                  placeholder="Search Fleet Job"
                />
              ) : null}

              <View style={styles.two}>
                <Field label="Amount inc GST">
                  <TextInput
                    style={styles.input}
                    keyboardType="decimal-pad"
                    value={row.amountIncGst}
                    onChangeText={(value) =>
                      patchLine(index, { amountIncGst: value })
                    }
                  />
                </Field>
                <Field label="GST">
                  <TextInput
                    style={styles.input}
                    keyboardType="decimal-pad"
                    value={row.gstAmount}
                    onChangeText={(value) =>
                      patchLine(index, { gstAmount: value })
                    }
                  />
                </Field>
              </View>

              {kind === "expense" ? (
                <>
                  <Field label="Expense Date">
                    <TextInput
                      style={styles.input}
                      value={row.expenseDate}
                      onChangeText={(value) =>
                        patchLine(index, { expenseDate: value })
                      }
                      placeholder="YYYY-MM-DD"
                    />
                  </Field>

                  <View style={styles.fileActions}>
                    <Pressable
                      style={styles.fileButton}
                      onPress={async () =>
                        patchLine(index, {
                          receipt: await pickFile("camera"),
                        })
                      }
                    >
                      <Text style={styles.fileButtonText}>
                        Take Receipt Photo
                      </Text>
                    </Pressable>
                    <Pressable
                      style={styles.fileButton}
                      onPress={async () =>
                        patchLine(index, {
                          receipt: await pickFile("file"),
                        })
                      }
                    >
                      <Text style={styles.fileButtonText}>
                        Choose Receipt
                      </Text>
                    </Pressable>
                  </View>

                  {row.receipt ? (
                    <Text style={styles.muted}>
                      Receipt: {row.receipt.name}
                    </Text>
                  ) : null}
                </>
              ) : null}
            </View>
          ))}

          <Pressable
            style={styles.add}
            onPress={() =>
              setLines((current) => [...current, emptyLine()])
            }
          >
            <Text style={styles.addText}>+ Add Item</Text>
          </Pressable>
        </Card>

        <View style={styles.total}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>
            {new Intl.NumberFormat("en-AU", {
              style: "currency",
              currency: "AUD",
            }).format(total)}
          </Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            disabled={saving}
            style={[styles.button, styles.secondary]}
            onPress={() => void save(false)}
          >
            <Text style={styles.secondaryText}>Save Draft</Text>
          </Pressable>
          <Pressable
            disabled={saving}
            style={[styles.button, styles.primary]}
            onPress={() => void save(true)}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>Submit</Text>
            )}
          </Pressable>
        </View>
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
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 6, flex: 1 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f8fafc" },
  content: { padding: 18, gap: 14, paddingBottom: 40 },
  eyebrow: {
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 1.2,
    color: "#2563eb",
  },
  heading: { fontSize: 28, fontWeight: "900", color: "#0f172a" },
  muted: { color: "#64748b", lineHeight: 20 },
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 18,
    padding: 16,
    gap: 13,
  },
  cardTitle: { fontSize: 17, fontWeight: "900", color: "#0f172a" },
  fieldLabel: { fontSize: 12, fontWeight: "800", color: "#475569" },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 11,
    padding: 11,
    backgroundColor: "#fff",
    color: "#0f172a",
  },
  notes: { minHeight: 80, textAlignVertical: "top" },
  two: { flexDirection: "row", gap: 10 },
  line: {
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  lineHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  lineTitle: { fontWeight: "900", color: "#0f172a" },
  allocationTypes: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  allocationChip: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  allocationChipActive: {
    backgroundColor: "#dbeafe",
    borderColor: "#60a5fa",
  },
  allocationChipText: {
    color: "#475569",
    fontWeight: "800",
    fontSize: 11,
  },
  allocationChipTextActive: { color: "#1d4ed8" },
  contextBox: {
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 10,
  },
  contextText: { color: "#475569", fontSize: 11, fontWeight: "700" },
  fileBlock: { gap: 7 },
  fileActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  fileButton: {
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    borderRadius: 11,
    padding: 10,
  },
  fileButtonText: { color: "#1d4ed8", fontWeight: "800" },
  remove: { color: "#be123c", fontWeight: "800" },
  add: {
    alignItems: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#94a3b8",
    borderRadius: 11,
    padding: 12,
  },
  addText: { fontWeight: "900", color: "#475569" },
  total: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 16,
    backgroundColor: "#0f172a",
    borderRadius: 16,
  },
  totalLabel: { color: "#cbd5e1", fontWeight: "800" },
  totalValue: { color: "#fff", fontWeight: "900", fontSize: 20 },
  actions: { flexDirection: "row", gap: 10 },
  button: {
    flex: 1,
    alignItems: "center",
    padding: 14,
    borderRadius: 13,
  },
  secondary: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  secondaryText: { fontWeight: "900", color: "#334155" },
  primary: { backgroundColor: "#2563eb" },
  primaryText: { fontWeight: "900", color: "#fff" },
});

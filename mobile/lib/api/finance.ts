import { apiFetch, apiJson, jsonBody } from "@/lib/api/client";
import { supabase } from "@/lib/supabase";
import type {
  FinanceAllocationInput,
  FinanceDetailPayload,
  FinanceFleetJob,
  FinanceKind,
  FinancePayload,
  FinancePlantAsset,
  FinanceProject,
  FinanceSubmissionType,
  FinanceVehicleAsset,
  SaveFinanceDraftInput,
  SaveFinanceDraftResult,
} from "@/types/finance";

export type PickedFinanceFile = {
  uri: string;
  name: string;
  mimeType: string;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function currentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Your TTTracker session has expired. Sign in again.");
  }

  return user;
}

function vehicleLabel(asset: FinanceVehicleAsset) {
  return [
    asset.vehicle_id,
    asset.vehicle_rego,
    [asset.make, asset.model].filter(Boolean).join(" "),
  ]
    .map(clean)
    .filter(Boolean)
    .join(" · ");
}

function plantLabel(asset: FinancePlantAsset) {
  return [
    asset.asset_id,
    asset.rego,
    asset.plant_type,
    [asset.make, asset.model].filter(Boolean).join(" "),
  ]
    .map(clean)
    .filter(Boolean)
    .join(" · ");
}

export function financeVehicleLabel(asset: FinanceVehicleAsset) {
  return vehicleLabel(asset) || "Vehicle";
}

export function financePlantLabel(asset: FinancePlantAsset) {
  return plantLabel(asset) || "Plant";
}

export function financeFleetJobLabel(job: FinanceFleetJob) {
  return (
    [job.job_number, job.asset_label, job.status]
      .map(clean)
      .filter(Boolean)
      .join(" · ") || "Fleet Job"
  );
}

async function financeReferences() {
  const [
    categoryResult,
    projectResult,
    vehicleResult,
    plantResult,
    fleetJobResult,
  ] = await Promise.all([
    supabase
      .from("financial_categories")
      .select("id,name,active")
      .order("sort_order")
      .order("name"),
    supabase
      .from("projects")
      .select("id,name,project_number")
      .order("name"),
    supabase
      .from("vehicle_assets")
      .select("id,vehicle_id,vehicle_rego,make,model,category,status")
      .order("vehicle_id"),
    supabase
      .from("plant_assets")
      .select(
        "id,asset_id,make,model,plant_type,serial_number,rego,asset_status",
      )
      .order("asset_id"),
    supabase
      .from("fleet_jobs")
      .select(
        "id,job_number,asset_type,vehicle_asset_id,plant_asset_id,asset_label,status",
      )
      .order("created_at", { ascending: false }),
  ]);

  const error =
    categoryResult.error ||
    projectResult.error ||
    vehicleResult.error ||
    plantResult.error ||
    fleetJobResult.error;

  if (error) throw new Error(error.message);

  return {
    categories: categoryResult.data ?? [],
    projects: (projectResult.data ?? []) as FinanceProject[],
    vehicleAssets: (vehicleResult.data ?? []) as FinanceVehicleAsset[],
    plantAssets: (plantResult.data ?? []) as FinancePlantAsset[],
    fleetJobs: (fleetJobResult.data ?? []) as FinanceFleetJob[],
  };
}

export async function getMyFinance(
  type: FinanceSubmissionType,
): Promise<FinancePayload> {
  const user = await currentUser();

  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (employeeError) throw new Error(employeeError.message);

  const ownerFilters = [
    `created_by.eq.${user.id}`,
    `submitted_by.eq.${user.id}`,
  ];

  if (type === "expense_claim" && employee?.id) {
    ownerFilters.push(`submitted_for_employee_id.eq.${employee.id}`);
  }

  const [submissionResult, refs] = await Promise.all([
    supabase
      .from("financial_submissions")
      .select("*")
      .eq("submission_type", type)
      .or(ownerFilters.join(","))
      .order("created_at", { ascending: false }),
    financeReferences(),
  ]);

  if (submissionResult.error) {
    throw new Error(submissionResult.error.message);
  }

  return {
    submissions: submissionResult.data ?? [],
    ...refs,
  };
}

async function resolveFleetJobs(
  allocations: FinanceAllocationInput[],
) {
  const ids = Array.from(
    new Set(
      allocations
        .filter((row) => row.allocationType === "fleet_job")
        .map((row) => clean(row.fleetJobId))
        .filter(Boolean),
    ),
  );

  if (!ids.length) return new Map<string, FinanceFleetJob>();

  const { data, error } = await supabase
    .from("fleet_jobs")
    .select(
      "id,job_number,asset_type,vehicle_asset_id,plant_asset_id,asset_label,status",
    )
    .in("id", ids);

  if (error) throw new Error(error.message);

  return new Map(
    ((data ?? []) as FinanceFleetJob[]).map((row) => [row.id, row]),
  );
}

function validateAllocation(
  row: FinanceAllocationInput,
  index: number,
  type: FinanceSubmissionType,
  primaryProjectId: string,
) {
  if (!clean(row.description)) {
    throw new Error(`Item ${index + 1}: enter a description.`);
  }

  if (numberValue(row.amountIncGst) <= 0) {
    throw new Error(`Item ${index + 1}: enter an amount greater than $0.`);
  }

  if (
    type === "expense_claim" &&
    row.allocationType === "project" &&
    !clean(primaryProjectId)
  ) {
    throw new Error(
      `Item ${index + 1}: select the primary project for the Project allocation.`,
    );
  }

  if (
    type === "invoice" &&
    row.allocationType === "project" &&
    !clean(row.projectId || primaryProjectId)
  ) {
    throw new Error(
      `Allocation ${index + 1}: select the project.`,
    );
  }

  if (
    row.allocationType === "vehicle" &&
    !clean(row.vehicleAssetId)
  ) {
    throw new Error(
      `Item ${index + 1}: select the vehicle.`,
    );
  }

  if (
    row.allocationType === "plant" &&
    !clean(row.plantAssetId)
  ) {
    throw new Error(
      `Item ${index + 1}: select the plant asset.`,
    );
  }

  if (
    row.allocationType === "fleet_job" &&
    !clean(row.fleetJobId)
  ) {
    throw new Error(
      `Item ${index + 1}: select the Fleet Job.`,
    );
  }
}

export async function saveFinanceDraft(
  input: SaveFinanceDraftInput,
): Promise<SaveFinanceDraftResult> {
  const user = await currentUser();

  if (!input.allocations.length) {
    throw new Error("Add at least one Finance item.");
  }

  input.allocations.forEach((row, index) =>
    validateAllocation(row, index, input.type, input.projectId),
  );

  const fleetJobById = await resolveFleetJobs(input.allocations);

  const totalInc = input.allocations.reduce(
    (sum, row) => sum + Math.max(numberValue(row.amountIncGst), 0),
    0,
  );

  const totalGst = input.allocations.reduce(
    (sum, row) => sum + Math.max(numberValue(row.gstAmount), 0),
    0,
  );

  const subtotalExGst = Math.max(totalInc - totalGst, 0);

  let employeeId: string | null = null;

  if (input.type === "expense_claim") {
    const { data: employee, error } = await supabase
      .from("employees")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    employeeId = clean(employee?.id) || null;
  }

  const invoiceDate =
    clean(input.invoiceDate) || new Date().toISOString().slice(0, 10);

  let submission: { id: string } | null = null;
  let submissionErrorMessage: string | null = null;

  if (input.type === "expense_claim") {
    const { data, error } = await supabase
      .from("financial_submissions")
      .insert({
        submission_type: "expense_claim",
        status: "draft",
        revision: 0,
        submitted_for_employee_id: employeeId,
        created_by: user.id,
        submitted_by: null,
        submitted_at: null,
        project_id: clean(input.projectId) || null,
        description: clean(input.description) || null,
        notes: clean(input.notes) || null,
        subtotal_ex_gst: subtotalExGst,
        gst_amount: totalGst,
        total_amount: totalInc,
      })
      .select("id")
      .single();

    submission = data;
    submissionErrorMessage = error?.message ?? null;
  } else {
    const { data, error } = await supabase
      .from("financial_submissions")
      .insert({
        submission_type: "invoice",
        status: "draft",
        revision: 0,
        submitted_for_employee_id: null,
        created_by: user.id,
        submitted_by: null,
        submitted_at: null,
        project_id: clean(input.projectId) || null,
        supplier_name: clean(input.supplierName) || null,
        supplier_abn: clean(input.supplierAbn) || null,
        invoice_number: clean(input.invoiceNumber) || null,
        invoice_date: invoiceDate,
        received_date: clean(input.receivedDate) || null,
        due_date: clean(input.dueDate) || null,
        purchase_order_number:
          clean(input.purchaseOrderNumber) || null,
        currency_code: "AUD",
        description: clean(input.description) || null,
        notes: clean(input.notes) || null,
        subtotal_ex_gst: subtotalExGst,
        gst_amount: totalGst,
        total_amount: totalInc,
      })
      .select("id")
      .single();

    submission = data;
    submissionErrorMessage = error?.message ?? null;
  }

  if (submissionErrorMessage || !submission) {
    throw new Error(
      submissionErrorMessage || "Finance draft could not be created.",
    );
  }

  const savedItems: { id: string }[] = [];

  try {
    for (let index = 0; index < input.allocations.length; index += 1) {
      const row = input.allocations[index];
      const amountInc = Math.max(numberValue(row.amountIncGst), 0);
      const gst = Math.max(
        Math.min(numberValue(row.gstAmount), amountInc),
        0,
      );
      const amountEx = amountInc - gst;

      const job =
        row.allocationType === "fleet_job"
          ? fleetJobById.get(clean(row.fleetJobId)) ?? null
          : null;

      const vehicleAssetId =
        row.allocationType === "vehicle"
          ? clean(row.vehicleAssetId) || null
          : row.allocationType === "fleet_job"
            ? clean(job?.vehicle_asset_id) || null
            : null;

      const plantAssetId =
        row.allocationType === "plant"
          ? clean(row.plantAssetId) || null
          : row.allocationType === "fleet_job"
            ? clean(job?.plant_asset_id) || null
            : null;

      const assetType = vehicleAssetId
        ? "Vehicle"
        : plantAssetId
          ? "Plant"
          : null;

      const projectId =
        input.type === "expense_claim"
          ? row.allocationType === "general"
            ? null
            : clean(input.projectId) || null
          : row.allocationType === "project"
            ? clean(row.projectId || input.projectId) || null
            : null;

      const { data: item, error: itemError } = await supabase
        .from("financial_submission_items")
        .insert({
          submission_id: submission.id,
          category_id: clean(row.categoryId) || null,
          expense_date:
            input.type === "invoice"
              ? invoiceDate
              : clean(row.expenseDate),
          supplier:
            input.type === "invoice"
              ? clean(input.supplierName) || null
              : null,
          description: clean(row.description),
          quantity: 1,
          unit_amount_ex_gst: amountEx,
          amount_ex_gst: amountEx,
          gst_amount: gst,
          amount_inc_gst: amountInc,
          notes: clean(row.notes) || null,
          sort_order: index,
          project_id: projectId,
          gst_applicable: gst > 0,
          asset_type: assetType,
          vehicle_asset_id: vehicleAssetId,
          plant_asset_id: plantAssetId,
          fleet_job_id:
            row.allocationType === "fleet_job"
              ? clean(row.fleetJobId) || null
              : null,
        })
        .select("id")
        .single();

      if (itemError || !item) {
        throw new Error(
          itemError?.message ||
            `Finance item ${index + 1} could not be saved.`,
        );
      }

      savedItems.push({ id: item.id });
    }

    const { error: eventError } = await supabase
      .from("financial_submission_events")
      .insert({
        submission_id: submission.id,
        revision: 0,
        event_type: "created",
        performed_by: user.id,
        comments: null,
        metadata: {
          source: "mobile",
          submission_type: input.type,
        },
      });

    if (eventError) {
      console.warn("Finance draft event warning:", eventError.message);
    }

    return {
      submissionId: submission.id,
      items: savedItems,
    };
  } catch (error) {
    // A new draft should not remain half-created if an item insert failed.
    await supabase
      .from("financial_submission_items")
      .delete()
      .eq("submission_id", submission.id);

    await supabase
      .from("financial_submissions")
      .delete()
      .eq("id", submission.id)
      .eq("status", "draft");

    throw error;
  }
}

function nativeFilePart(file: PickedFinanceFile) {
  return {
    uri: file.uri,
    name: file.name,
    type: file.mimeType || "application/octet-stream",
  };
}

export async function uploadExpenseReceipt({
  submissionId,
  itemId,
  file,
}: {
  submissionId: string;
  itemId: string;
  file: PickedFinanceFile;
}) {
  const form = new FormData();
  form.append("submissionId", submissionId);
  form.append("itemId", itemId);
  form.append(
    "file",
    nativeFilePart(file) as unknown as Blob,
  );

  return jsonBody<Record<string, unknown>>(
    apiFetch("/api/expenses/attachments/upload", {
      method: "POST",
      body: form,
      timeoutMs: 120_000,
    }),
    "Receipt upload failed.",
  );
}

export async function uploadInvoiceDocument({
  submissionId,
  file,
  documentType,
}: {
  submissionId: string;
  file: PickedFinanceFile;
  documentType: "invoice" | "supporting_document";
}) {
  const form = new FormData();
  form.append("submissionId", submissionId);
  form.append("documentType", documentType);
  form.append(
    "file",
    nativeFilePart(file) as unknown as Blob,
  );

  return jsonBody<Record<string, unknown>>(
    apiFetch("/api/expenses/invoices/attachments/upload", {
      method: "POST",
      body: form,
      timeoutMs: 120_000,
    }),
    "Invoice document upload failed.",
  );
}

export async function submitExpenseClaim(submissionId: string) {
  return apiJson<Record<string, unknown>>("/api/expenses/claims", {
    method: "POST",
    body: JSON.stringify({ submissionId }),
    timeoutMs: 120_000,
  });
}

export async function submitInvoice(submissionId: string) {
  return apiJson<Record<string, unknown>>("/api/expenses/invoices", {
    method: "POST",
    body: JSON.stringify({ submissionId }),
    timeoutMs: 120_000,
  });
}

/**
 * Read-only fallback for an employee opening their own Expense / Invoice from
 * the My Finance list. Approval capability remains false.
 *
 * The dedicated approval API is still used first for configured approvers.
 */
export async function getMyFinanceDetail(
  kind: FinanceKind,
  submissionId: string,
): Promise<FinanceDetailPayload> {
  const user = await currentUser();
  const submissionType: FinanceSubmissionType =
    kind === "invoice" ? "invoice" : "expense_claim";

  const { data: submission, error: submissionError } = await supabase
    .from("financial_submissions")
    .select("*")
    .eq("id", submissionId)
    .eq("submission_type", submissionType)
    .maybeSingle();

  if (submissionError) throw new Error(submissionError.message);
  if (!submission) throw new Error("Finance record could not be found.");

  let ownsRecord =
    clean(submission.created_by) === user.id ||
    clean(submission.submitted_by) === user.id;

  if (!ownsRecord && clean(submission.submitted_for_employee_id)) {
    const { data: employee, error: employeeError } = await supabase
      .from("employees")
      .select("user_id")
      .eq("id", submission.submitted_for_employee_id)
      .maybeSingle();

    if (employeeError) throw new Error(employeeError.message);
    ownsRecord = clean(employee?.user_id) === user.id;
  }

  if (!ownsRecord) {
    throw new Error(
      "You are not configured to review this Finance workflow.",
    );
  }

  const [itemsResult, attachmentsResult, refs] = await Promise.all([
    supabase
      .from("financial_submission_items")
      .select("*")
      .eq("submission_id", submissionId)
      .order("sort_order"),
    supabase
      .from("financial_attachments")
      .select("*")
      .eq("submission_id", submissionId)
      .order("uploaded_at", { ascending: false }),
    financeReferences(),
  ]);

  if (itemsResult.error) throw new Error(itemsResult.error.message);
  if (attachmentsResult.error) {
    throw new Error(attachmentsResult.error.message);
  }

  const project =
    refs.projects.find(
      (row) => row.id === clean(submission.project_id),
    ) ?? null;

  return {
    kind,
    capability: {
      canReviewEdit: false,
      canApprove: false,
      canMarkPaid: false,
    },
    submission,
    items: itemsResult.data ?? [],
    attachments: attachmentsResult.data ?? [],
    categories: refs.categories,
    project,
    vehicleAssets: refs.vehicleAssets,
    plantAssets: refs.plantAssets,
    fleetJobs: refs.fleetJobs,
    readOnly: true,
  };
}

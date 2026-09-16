import {
  assetIdColumn,
  clean,
  type AssetIdentity,
  type AssetServiceClient,
} from "@/lib/assets/server";
import type {
  AssetDocumentRow,
  AssetSpendRow,
  AssetType,
} from "@/lib/assets/types";

type FinancialItemRow = {
  id: string;
  submission_id: string;
  expense_date: string | null;
  supplier: string | null;
  description: string | null;
  amount_ex_gst: number | string | null;
  gst_amount: number | string | null;
  amount_inc_gst: number | string | null;
  fleet_job_id: string | null;
  asset_service_record_id?: string | null;
  asset_document_id?: string | null;
};

type FinancialSubmissionRow = {
  id: string;
  submission_number: string;
  submission_type: string;
  status: string;
  supplier_name: string | null;
  invoice_number: string | null;
  created_at: string | null;
};

type FleetJobLookup = {
  id: string;
  vehicle_asset_id?: string | null;
  plant_asset_id?: string | null;
  plant_id?: string | null;
};

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function linkedFleetJobIds({
  service,
  assetType,
  assetId,
}: {
  service: AssetServiceClient;
  assetType: AssetType;
  assetId: string;
}) {
  const { data, error } = await service.from("fleet_jobs").select("*");
  if (error) throw new Error(error.message);

  return ((data ?? []) as FleetJobLookup[])
    .filter((job) =>
      assetType === "vehicle"
        ? clean(job.vehicle_asset_id) === assetId
        : clean(job.plant_asset_id || job.plant_id) === assetId,
    )
    .map((job) => clean(job.id))
    .filter(Boolean);
}

export async function loadAssetSpend({
  service,
  assetType,
  assetId,
}: {
  service: AssetServiceClient;
  assetType: AssetType;
  assetId: string;
}): Promise<AssetSpendRow[]> {
  const assetColumn = assetIdColumn(assetType);
  const fleetJobIds = await linkedFleetJobIds({
    service,
    assetType,
    assetId,
  });

  const directResult = await service
    .from("financial_submission_items")
    .select(
      "id,submission_id,expense_date,supplier,description,amount_ex_gst,gst_amount,amount_inc_gst,fleet_job_id,asset_service_record_id,asset_document_id",
    )
    .eq(assetColumn, assetId);

  if (directResult.error) throw new Error(directResult.error.message);

  let fleetItems: FinancialItemRow[] = [];

  if (fleetJobIds.length > 0) {
    const fleetResult = await service
      .from("financial_submission_items")
      .select(
        "id,submission_id,expense_date,supplier,description,amount_ex_gst,gst_amount,amount_inc_gst,fleet_job_id,asset_service_record_id,asset_document_id",
      )
      .in("fleet_job_id", fleetJobIds);

    if (fleetResult.error) throw new Error(fleetResult.error.message);
    fleetItems = (fleetResult.data ?? []) as FinancialItemRow[];
  }

  const byId = new Map<string, FinancialItemRow>();
  for (const item of [
    ...((directResult.data ?? []) as FinancialItemRow[]),
    ...fleetItems,
  ]) {
    byId.set(item.id, item);
  }

  const items = Array.from(byId.values());
  if (items.length === 0) return [];

  const submissionIds = Array.from(
    new Set(items.map((item) => item.submission_id)),
  );

  const { data: submissionData, error: submissionError } = await service
    .from("financial_submissions")
    .select(
      "id,submission_number,submission_type,status,supplier_name,invoice_number,created_at",
    )
    .in("id", submissionIds);

  if (submissionError) throw new Error(submissionError.message);

  const submissions = new Map(
    ((submissionData ?? []) as FinancialSubmissionRow[]).map((row) => [
      row.id,
      row,
    ]),
  );

  return items
    .map((item) => {
      const submission = submissions.get(item.submission_id);

      return {
        itemId: item.id,
        submissionId: item.submission_id,
        submissionNumber:
          submission?.submission_number || item.submission_id,
        submissionType: submission?.submission_type || "unknown",
        status: submission?.status || "unknown",
        expenseDate: item.expense_date,
        supplier:
          clean(item.supplier) || clean(submission?.supplier_name) || null,
        description: clean(item.description) || "Asset expense",
        invoiceNumber: clean(submission?.invoice_number) || null,
        amountExGst: numberValue(item.amount_ex_gst),
        gstAmount: numberValue(item.gst_amount),
        amountIncGst: numberValue(item.amount_inc_gst),
        fleetJobId: item.fleet_job_id,
        serviceRecordId: item.asset_service_record_id ?? null,
        assetDocumentId: item.asset_document_id ?? null,
        createdAt: submission?.created_at ?? null,
      } satisfies AssetSpendRow;
    })
    .sort((left, right) =>
      String(right.expenseDate ?? right.createdAt ?? "").localeCompare(
        String(left.expenseDate ?? left.createdAt ?? ""),
      ),
    );
}

export async function createAssetFinanceInvoice({
  service,
  identity,
  assetType,
  assetId,
  projectId,
  fleetJobId,
  serviceRecordId,
  supplier,
  invoiceNumber,
  invoiceDate,
  description,
  amountExGst,
  gstAmount,
  amountIncGst,
  document,
}: {
  service: AssetServiceClient;
  identity: AssetIdentity;
  assetType: AssetType;
  assetId: string;
  projectId?: string | null;
  fleetJobId?: string | null;
  serviceRecordId?: string | null;
  supplier?: string | null;
  invoiceNumber?: string | null;
  invoiceDate: string;
  description: string;
  amountExGst: number;
  gstAmount: number;
  amountIncGst: number;
  document?: AssetDocumentRow | null;
}) {
  const now = new Date().toISOString();

  const { data: submission, error: submissionError } = await service
    .from("financial_submissions")
    .insert({
      submission_type: "invoice",
      status: "draft",
      revision: 0,
      created_by: identity.userId,
      submitted_by: null,
      project_id: clean(projectId) || null,
      supplier_name: clean(supplier) || null,
      invoice_number: clean(invoiceNumber) || null,
      description: clean(description) || "Asset invoice",
      notes: `Created from Assets for ${assetType} asset ${assetId}.`,
      subtotal_ex_gst: amountExGst,
      gst_amount: gstAmount,
      total_amount: amountIncGst,
      submitted_at: null,
      due_date: null,
    })
    .select("id,submission_number")
    .single();

  if (submissionError) throw new Error(submissionError.message);

  const { data: item, error: itemError } = await service
    .from("financial_submission_items")
    .insert({
      submission_id: submission.id,
      category_id: null,
      expense_date: invoiceDate,
      supplier: clean(supplier) || null,
      description: clean(description) || "Asset invoice",
      quantity: 1,
      unit_amount_ex_gst: amountExGst,
      amount_ex_gst: amountExGst,
      gst_amount: gstAmount,
      amount_inc_gst: amountIncGst,
      notes: clean(invoiceNumber) ? `Invoice ${clean(invoiceNumber)}` : null,
      sort_order: 0,
      project_id: clean(projectId) || null,
      gst_applicable: gstAmount > 0,
      asset_type: assetType === "vehicle" ? "Vehicle" : "Plant",
      vehicle_asset_id: assetType === "vehicle" ? assetId : null,
      plant_asset_id: assetType === "plant" ? assetId : null,
      fleet_job_id: clean(fleetJobId) || null,
      asset_service_record_id: clean(serviceRecordId) || null,
      asset_document_id: document?.id ?? null,
    })
    .select("id")
    .single();

  if (itemError) throw new Error(itemError.message);

  let attachmentId: string | null = null;

  if (document) {
    const { data: attachment, error: attachmentError } = await service
      .from("financial_attachments")
      .insert({
        submission_id: submission.id,
        item_id: item.id,
        attachment_type: "invoice",
        file_name: document.file_name,
        content_type: document.content_type,
        file_size_bytes: document.file_size_bytes,
        sharepoint_site_id: document.sharepoint_site_id,
        sharepoint_drive_id: document.sharepoint_drive_id,
        sharepoint_item_id: document.sharepoint_item_id,
        sharepoint_web_url: document.sharepoint_web_url,
        uploaded_by: identity.userId,
        asset_document_id: document.id,
      })
      .select("id")
      .single();

    if (attachmentError) throw new Error(attachmentError.message);
    attachmentId = attachment.id;

    const { error: documentUpdateError } = await service
      .from("asset_documents")
      .update({
        financial_submission_id: submission.id,
        financial_item_id: item.id,
        financial_attachment_id: attachmentId,
      })
      .eq("id", document.id);

    if (documentUpdateError) throw new Error(documentUpdateError.message);
  }

  const { error: eventError } = await service
    .from("financial_submission_events")
    .insert({
      submission_id: submission.id,
      revision: 0,
      event_type: "created",
      performed_by: identity.userId,
      comments: null,
      metadata: {
        source: "assets",
        asset_type: assetType,
        asset_id: assetId,
        service_record_id: clean(serviceRecordId) || null,
        created_at: now,
      },
    });

  if (eventError) {
    console.error("Asset Finance event insert warning", eventError);
  }

  return {
    submissionId: submission.id,
    submissionNumber: submission.submission_number,
    itemId: item.id,
    attachmentId,
  };
}

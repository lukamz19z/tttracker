import type { SupabaseClient } from "@supabase/supabase-js";

import { loadSystemPdfBranding } from "@/lib/branding/server";
import { generateExpenseClaimPdf } from "@/lib/finance/expense-claim-pdf";
import {
  ensureExpenseClaimFolder,
  safeFinanceSharePointPart,
  uploadExpenseClaimFile,
} from "@/lib/sharepoint/finance";

type Submission = {
  id: string;
  submission_number: string;
  revision: number | null;
  submitted_for_employee_id: string | null;
  created_by: string;
  submitted_by: string | null;
  project_id: string | null;
  description: string | null;
  notes: string | null;
  subtotal_ex_gst: number | string | null;
  gst_amount: number | string | null;
  total_amount: number | string | null;
  submitted_at: string | null;
  created_at: string;
};

export async function publishApprovedExpenseClaim({
  service,
  submission,
  approvedByUserId,
  approvedByName,
  approvedByEmail,
  approvedAt,
}: {
  service: SupabaseClient;
  submission: Submission;
  approvedByUserId: string;
  approvedByName: string;
  approvedByEmail: string | null;
  approvedAt: string;
}) {
  const { data: settings, error: settingsError } = await service
    .from("financial_settings")
    .select(
      "sharepoint_site_id,sharepoint_drive_id,sharepoint_base_folder",
    )
    .eq("id", true)
    .single();

  if (settingsError) throw new Error(settingsError.message);

  if (!settings.sharepoint_site_id || !settings.sharepoint_drive_id) {
    throw new Error(
      "Finance SharePoint storage has not been connected in Finance Settings.",
    );
  }

  const [itemResult, categoryResult, receiptResult, projectResult, employeeResult, branding] =
    await Promise.all([
      service
        .from("financial_submission_items")
        .select(
          "id,category_id,expense_date,supplier,description,amount_ex_gst,gst_amount,amount_inc_gst,notes,sort_order",
        )
        .eq("submission_id", submission.id)
        .order("sort_order"),
      service
        .from("financial_categories")
        .select("id,name"),
      service
        .from("financial_attachments")
        .select("file_name")
        .eq("submission_id", submission.id)
        .eq("attachment_type", "receipt")
        .order("uploaded_at"),
      submission.project_id
        ? service
            .from("projects")
            .select("name,project_number")
            .eq("id", submission.project_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      submission.submitted_for_employee_id
        ? service
            .from("employees")
            .select("full_name")
            .eq("id", submission.submitted_for_employee_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      loadSystemPdfBranding(),
    ]);

  if (itemResult.error) throw new Error(itemResult.error.message);
  if (categoryResult.error) throw new Error(categoryResult.error.message);
  if (receiptResult.error) throw new Error(receiptResult.error.message);
  if (projectResult.error) throw new Error(projectResult.error.message);
  if (employeeResult.error) throw new Error(employeeResult.error.message);

  const submitterUserId = submission.submitted_by || submission.created_by;
  const { data: submitterAuth } = await service.auth.admin.getUserById(
    submitterUserId,
  );

  const submitterName =
    String(employeeResult.data?.full_name ?? "").trim() ||
    String(
      submitterAuth.user?.user_metadata?.full_name ??
        submitterAuth.user?.user_metadata?.name ??
        submitterAuth.user?.email ??
        "TTTracker User",
    ).trim();

  const categoryMap = new Map(
    (categoryResult.data ?? []).map((row) => [String(row.id), String(row.name)]),
  );

  const projectLabel = projectResult.data
    ? [projectResult.data.project_number, projectResult.data.name]
        .filter(Boolean)
        .join(" - ")
    : "Company / General";

  const pdf = generateExpenseClaimPdf({
    submissionNumber: submission.submission_number,
    revision: Math.max(1, Number(submission.revision ?? 1) || 1),
    description: submission.description,
    notes: submission.notes,
    projectLabel,
    submittedBy: submitterName,
    submittedAt: submission.submitted_at,
    approvedBy: approvedByName,
    approvedByEmail,
    approvedAt,
    subtotalExGst: Number(submission.subtotal_ex_gst ?? 0) || 0,
    gstAmount: Number(submission.gst_amount ?? 0) || 0,
    totalAmount: Number(submission.total_amount ?? 0) || 0,
    receiptNames: (receiptResult.data ?? []).map((row) => row.file_name),
    items: (itemResult.data ?? []).map((item) => ({
      expenseDate: item.expense_date,
      category: item.category_id
        ? categoryMap.get(String(item.category_id)) ?? "Uncategorised"
        : "Uncategorised",
      supplier: item.supplier,
      description: item.description,
      amountExGst: Number(item.amount_ex_gst ?? 0) || 0,
      gstAmount: Number(item.gst_amount ?? 0) || 0,
      amountIncGst: Number(item.amount_inc_gst ?? 0) || 0,
      notes: item.notes,
    })),
    branding: {
      logoDataUrl: branding.logoDataUrl,
      companyName: branding.companyName,
      abn: branding.abn,
      addressLine1: branding.addressLine1,
      addressLine2: branding.addressLine2,
      suburb: branding.suburb,
      state: branding.state,
      postcode: branding.postcode,
      phone: branding.phone,
      email: branding.email,
      website: branding.website,
    },
  });

  const claimFolder = await ensureExpenseClaimFolder({
    driveId: settings.sharepoint_drive_id,
    baseFolder: settings.sharepoint_base_folder || "Expenses & Invoices",
    submissionNumber: submission.submission_number,
    anchorDate: submission.created_at,
  });

  const revision = Math.max(1, Number(submission.revision ?? 1) || 1);
  const fileName = safeFinanceSharePointPart(
    `${submission.submission_number}-R${String(revision).padStart(2, "0")}-Approved.pdf`,
  );

  const uploaded = await uploadExpenseClaimFile({
    driveId: settings.sharepoint_drive_id,
    folderId: claimFolder.id,
    fileName,
    content: pdf,
    contentType: "application/pdf",
  });

  const { data: existingAttachment, error: existingError } = await service
    .from("financial_attachments")
    .select("id")
    .eq("submission_id", submission.id)
    .eq("attachment_type", "supporting_document")
    .eq("file_name", fileName)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);

  const metadata = {
    submission_id: submission.id,
    item_id: null,
    attachment_type: "supporting_document",
    file_name: fileName,
    content_type: "application/pdf",
    file_size_bytes: pdf.byteLength,
    sharepoint_site_id: settings.sharepoint_site_id,
    sharepoint_drive_id: settings.sharepoint_drive_id,
    sharepoint_item_id: uploaded.id,
    sharepoint_web_url: uploaded.webUrl ?? null,
    uploaded_by: approvedByUserId,
  };

  if (existingAttachment?.id) {
    const { error } = await service
      .from("financial_attachments")
      .update(metadata)
      .eq("id", existingAttachment.id);

    if (error) throw new Error(error.message);
  } else {
    const { error } = await service.from("financial_attachments").insert(metadata);
    if (error) throw new Error(error.message);
  }

  return {
    fileName,
    folderId: claimFolder.id,
    itemId: uploaded.id,
    webUrl: uploaded.webUrl ?? null,
    driveId: settings.sharepoint_drive_id,
    siteId: settings.sharepoint_site_id,
  };
}

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import {
  ensureExpenseClaimReceiptsFolder,
  safeFinanceSharePointPart,
  uploadExpenseClaimFile,
} from "@/lib/sharepoint/finance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function env(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function adminClient() {
  return createClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function authenticatedUser(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";

  if (!token) throw new Error("UNAUTHENTICATED");

  const admin = adminClient();
  const {
    data: { user },
    error,
  } = await admin.auth.getUser(token);

  if (error || !user) throw new Error("UNAUTHENTICATED");
  return { admin, user };
}

export async function POST(request: Request) {
  try {
    const { admin, user } = await authenticatedUser(request);
    const form = await request.formData();

    const file = form.get("file");
    const submissionId = String(form.get("submissionId") ?? "").trim();
    const itemId = String(form.get("itemId") ?? "").trim();

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Choose a receipt file." },
        { status: 400 },
      );
    }

    if (!submissionId || !itemId) {
      return NextResponse.json(
        { error: "Save the expense claim item before uploading its receipt." },
        { status: 400 },
      );
    }

    if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "Receipt files must be 15 MB or smaller." },
        { status: 400 },
      );
    }

    const contentType = file.type || "application/octet-stream";
    if (!ALLOWED_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: "Upload a PDF, JPG, PNG, WEBP, HEIC or HEIF receipt." },
        { status: 400 },
      );
    }

    const { data: submission, error: submissionError } = await admin
      .from("financial_submissions")
      .select(
        "id,submission_number,submission_type,status,created_at,created_by,submitted_by,submitted_for_employee_id",
      )
      .eq("id", submissionId)
      .eq("submission_type", "expense_claim")
      .single();

    if (submissionError || !submission) {
      return NextResponse.json(
        { error: "Expense claim not found." },
        { status: 404 },
      );
    }

    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    const role = String(roleRow?.role ?? "").trim().toLowerCase();
    const isAdmin = ["admin", "administrator", "site_admin"].includes(role);

    const { data: employee } = await admin
      .from("employees")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: userRules, error: ruleError } = await admin
      .from("financial_access_rules")
      .select("can_review_edit,can_approve")
      .eq("active", true)
      .eq("principal_type", "user")
      .eq("user_id", user.id)
      .or("applies_to.eq.all,applies_to.eq.expense_claim");

    if (ruleError) throw new Error(ruleError.message);

    const canReview = (userRules ?? []).some(
      (row) => row.can_review_edit || row.can_approve,
    );

    const ownsSubmission =
      submission.created_by === user.id ||
      submission.submitted_by === user.id ||
      Boolean(
        employee?.id &&
          submission.submitted_for_employee_id === employee.id,
      );

    if (!isAdmin && !canReview && !ownsSubmission) {
      return NextResponse.json(
        { error: "You do not have access to this claim." },
        { status: 403 },
      );
    }

    if (
      !["draft", "submitted", "changes_required"].includes(submission.status) &&
      !isAdmin
    ) {
      return NextResponse.json(
        { error: "Receipts cannot be changed after the claim is approved." },
        { status: 409 },
      );
    }

    const { data: item, error: itemError } = await admin
      .from("financial_submission_items")
      .select("id,submission_id,expense_date")
      .eq("id", itemId)
      .eq("submission_id", submissionId)
      .single();

    if (itemError || !item) {
      return NextResponse.json(
        { error: "Expense item not found." },
        { status: 404 },
      );
    }

    const { data: settings, error: settingsError } = await admin
      .from("financial_settings")
      .select(
        "sharepoint_site_id,sharepoint_drive_id,sharepoint_drive_name,sharepoint_base_folder",
      )
      .eq("id", true)
      .single();

    if (settingsError) throw new Error(settingsError.message);

    if (!settings.sharepoint_site_id || !settings.sharepoint_drive_id) {
      return NextResponse.json(
        {
          error:
            "Finance SharePoint storage has not been connected in Finance Settings.",
        },
        { status: 409 },
      );
    }

    const receiptsFolder = await ensureExpenseClaimReceiptsFolder({
      driveId: settings.sharepoint_drive_id,
      baseFolder: settings.sharepoint_base_folder || "Expenses & Invoices",
      submissionNumber: submission.submission_number,
      anchorDate: submission.created_at,
    });

    const originalName = safeFinanceSharePointPart(file.name || "receipt");
    const extensionIndex = originalName.lastIndexOf(".");
    const baseName =
      extensionIndex > 0 ? originalName.slice(0, extensionIndex) : originalName;
    const extension =
      extensionIndex > 0 ? originalName.slice(extensionIndex) : "";
    const storedName = `${safeFinanceSharePointPart(baseName)}-${Date.now()}${extension}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const uploaded = await uploadExpenseClaimFile({
      driveId: settings.sharepoint_drive_id,
      folderId: receiptsFolder.id,
      fileName: storedName,
      content: bytes,
      contentType,
    });

    const { data: attachment, error: attachmentError } = await admin
      .from("financial_attachments")
      .insert({
        submission_id: submissionId,
        item_id: itemId,
        attachment_type: "receipt",
        file_name: file.name || storedName,
        content_type: contentType,
        file_size_bytes: file.size,
        sharepoint_site_id: settings.sharepoint_site_id,
        sharepoint_drive_id: settings.sharepoint_drive_id,
        sharepoint_item_id: uploaded.id,
        sharepoint_web_url: uploaded.webUrl ?? null,
        uploaded_by: user.id,
      })
      .select(
        "id,submission_id,item_id,attachment_type,file_name,content_type,file_size_bytes,uploaded_at",
      )
      .single();

    if (attachmentError) {
      throw new Error(
        `Receipt uploaded to SharePoint but metadata could not be saved: ${attachmentError.message}`,
      );
    }

    await admin.from("financial_submission_events").insert({
      submission_id: submissionId,
      revision: 0,
      event_type: "receipt_uploaded",
      performed_by: user.id,
      comments: null,
      metadata: {
        source: "website",
        item_id: itemId,
        attachment_id: attachment.id,
        file_name: file.name,
        sharepoint_web_url: uploaded.webUrl ?? null,
      },
    });

    return NextResponse.json({ attachment });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Receipt upload failed.";

    if (message === "UNAUTHENTICATED") {
      return NextResponse.json(
        { error: "You must be signed in." },
        { status: 401 },
      );
    }

    console.error("FINANCE RECEIPT UPLOAD ERROR:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

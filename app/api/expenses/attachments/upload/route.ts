import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import {
  ensureDriveFolder,
  uploadDriveItemContent,
} from "@/lib/sharepoint/graph";

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

function safePart(value: string) {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\.+$/g, "")
    .slice(0, 120) || "File";
}

function monthParts(value: string) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00Z`)
    : new Date();

  const valid = Number.isNaN(date.getTime()) ? new Date() : date;

  return {
    year: String(valid.getUTCFullYear()),
    month: `${String(valid.getUTCMonth() + 1).padStart(2, "0")} - ${valid.toLocaleString("en-AU", {
      month: "long",
      timeZone: "UTC",
    })}`,
  };
}

async function ensurePath(driveId: string, names: string[]) {
  let parentId = "root";

  for (const name of names) {
    const folder = await ensureDriveFolder({
      driveId,
      parentItemId: parentId,
      name,
    });
    parentId = folder.id;
  }

  return parentId;
}

export async function POST(request: Request) {
  try {
    const { admin, user } = await authenticatedUser(request);
    const form = await request.formData();

    const file = form.get("file");
    const submissionId = String(form.get("submissionId") ?? "").trim();
    const itemId = String(form.get("itemId") ?? "").trim();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose a receipt file." }, { status: 400 });
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
        "id,submission_number,submission_type,status,created_by,submitted_by,submitted_for_employee_id",
      )
      .eq("id", submissionId)
      .eq("submission_type", "expense_claim")
      .single();

    if (submissionError || !submission) {
      return NextResponse.json({ error: "Expense claim not found." }, { status: 404 });
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

    const { data: permissionRows, error: permissionError } = await admin
      .from("financial_access_rules")
      .select("can_review_edit,can_approve")
      .eq("active", true)
      .or(`applies_to.eq.all,applies_to.eq.expense_claim`);

    if (permissionError) throw new Error(permissionError.message);

    const { data: userRules } = await admin
      .from("financial_access_rules")
      .select("can_review_edit,can_approve")
      .eq("active", true)
      .eq("principal_type", "user")
      .eq("user_id", user.id)
      .or(`applies_to.eq.all,applies_to.eq.expense_claim`);

    const { data: roleRules } = await admin
      .from("financial_access_rules")
      .select("can_review_edit,can_approve")
      .eq("active", true)
      .eq("principal_type", "role")
      .eq("role", role)
      .or(`applies_to.eq.all,applies_to.eq.expense_claim`);

    void permissionRows;

    const canReview = [...(userRules ?? []), ...(roleRules ?? [])].some(
      (row) => row.can_review_edit || row.can_approve,
    );

    const ownsSubmission =
      submission.created_by === user.id ||
      submission.submitted_by === user.id ||
      (employee?.id &&
        submission.submitted_for_employee_id === employee.id);

    if (!isAdmin && !canReview && !ownsSubmission) {
      return NextResponse.json({ error: "You do not have access to this claim." }, { status: 403 });
    }

    if (!["draft", "submitted", "changes_required"].includes(submission.status) && !isAdmin) {
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
      return NextResponse.json({ error: "Expense item not found." }, { status: 404 });
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
        { error: "Finance SharePoint storage has not been connected in Expenses → Settings." },
        { status: 409 },
      );
    }

    const { year, month } = monthParts(item.expense_date);
    const baseFolder = safePart(settings.sharepoint_base_folder || "Expenses & Invoices");
    const claimFolder = safePart(submission.submission_number);

    const receiptsFolderId = await ensurePath(settings.sharepoint_drive_id, [
      baseFolder,
      year,
      month,
      "Expense Claims",
      claimFolder,
      "Receipts",
    ]);

    const originalName = safePart(file.name || "receipt");
    const extensionIndex = originalName.lastIndexOf(".");
    const baseName =
      extensionIndex > 0 ? originalName.slice(0, extensionIndex) : originalName;
    const extension =
      extensionIndex > 0 ? originalName.slice(extensionIndex) : "";

    const storedName = `${safePart(baseName)}-${Date.now()}${extension}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const uploaded = await uploadDriveItemContent({
      driveId: settings.sharepoint_drive_id,
      parentItemId: receiptsFolderId,
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
      },
    });

    return NextResponse.json({ attachment });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Receipt upload failed.";

    if (message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    console.error("FINANCE RECEIPT UPLOAD ERROR:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

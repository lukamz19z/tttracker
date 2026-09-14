import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { deleteDriveItem } from "@/lib/sharepoint/graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ attachmentId: string }>;
};

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

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { attachmentId } = await context.params;
    const { admin, user } = await authenticatedUser(request);

    if (!attachmentId) {
      return NextResponse.json(
        { error: "Attachment ID is required." },
        { status: 400 },
      );
    }

    const { data: attachment, error: attachmentError } = await admin
      .from("financial_attachments")
      .select(
        "id,submission_id,item_id,attachment_type,file_name,sharepoint_drive_id,sharepoint_item_id",
      )
      .eq("id", attachmentId)
      .single();

    if (attachmentError || !attachment) {
      return NextResponse.json(
        { error: "Receipt not found." },
        { status: 404 },
      );
    }

    if (attachment.attachment_type !== "receipt") {
      return NextResponse.json(
        { error: "Only receipt attachments can be removed from a claim draft." },
        { status: 400 },
      );
    }

    const { data: submission, error: submissionError } = await admin
      .from("financial_submissions")
      .select(
        "id,submission_type,status,revision,created_by,submitted_by,submitted_for_employee_id",
      )
      .eq("id", attachment.submission_id)
      .single();

    if (submissionError || !submission) {
      return NextResponse.json(
        { error: "Expense Claim not found." },
        { status: 404 },
      );
    }

    if (submission.submission_type !== "expense_claim") {
      return NextResponse.json(
        { error: "This attachment is not part of an Expense Claim." },
        { status: 400 },
      );
    }

    if (!["draft", "changes_required"].includes(submission.status)) {
      return NextResponse.json(
        {
          error:
            "Receipts are locked while the Expense Claim is pending approval or after approval.",
        },
        { status: 409 },
      );
    }

    const [{ data: roleRow }, { data: employee }] = await Promise.all([
      admin
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle(),
      admin
        .from("employees")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    const role = String(roleRow?.role ?? "").trim().toLowerCase();
    const isAdmin = ["admin", "administrator", "site_admin"].includes(role);

    const ownsSubmission =
      submission.created_by === user.id ||
      submission.submitted_by === user.id ||
      Boolean(
        employee?.id &&
          submission.submitted_for_employee_id === employee.id,
      );

    if (!isAdmin && !ownsSubmission) {
      return NextResponse.json(
        { error: "Only the claim owner can change draft receipts." },
        { status: 403 },
      );
    }

    if (attachment.sharepoint_drive_id && attachment.sharepoint_item_id) {
      await deleteDriveItem({
        driveId: attachment.sharepoint_drive_id,
        itemId: attachment.sharepoint_item_id,
      });
    }

    const { error: deleteError } = await admin
      .from("financial_attachments")
      .delete()
      .eq("id", attachment.id);

    if (deleteError) {
      throw new Error(
        `The SharePoint receipt was removed, but TTTracker metadata could not be deleted: ${deleteError.message}`,
      );
    }

    await admin.from("financial_submission_events").insert({
      submission_id: submission.id,
      revision: Math.max(0, Number(submission.revision ?? 0) || 0),
      event_type: "receipt_removed",
      performed_by: user.id,
      comments: null,
      metadata: {
        source: "website",
        attachment_id: attachment.id,
        item_id: attachment.item_id,
        file_name: attachment.file_name,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Receipt could not be removed.";

    if (message === "UNAUTHENTICATED") {
      return NextResponse.json(
        { error: "You must be signed in." },
        { status: 401 },
      );
    }

    console.error("FINANCE RECEIPT DELETE ERROR:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

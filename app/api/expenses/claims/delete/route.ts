import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { getGraphAccessToken } from "@/lib/sharepoint/graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function serviceClient() {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

async function requireAdministrator(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";

  if (!token) throw new Error("UNAUTHENTICATED");

  const service = serviceClient();
  const {
    data: { user },
    error: userError,
  } = await service.auth.getUser(token);

  if (userError || !user) throw new Error("UNAUTHENTICATED");

  const { data: roleRow, error: roleError } = await service
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (roleError) throw new Error(roleError.message);

  const role = String(roleRow?.role ?? "").trim().toLowerCase();
  if (!["admin", "administrator", "site_admin"].includes(role)) {
    throw new Error("FORBIDDEN");
  }

  return { service, user };
}

async function deleteSharePointItem({
  driveId,
  itemId,
  token,
}: {
  driveId: string;
  itemId: string;
  token: string;
}) {
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(
      driveId,
    )}/items/${encodeURIComponent(itemId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    },
  );

  if (response.ok || response.status === 404) return;

  const detail = await response.text();
  throw new Error(
    `SharePoint cleanup failed (${response.status}): ${detail || response.statusText}`,
  );
}

export async function POST(request: Request) {
  try {
    const { service, user } = await requireAdministrator(request);

    const body = (await request.json()) as {
      submissionId?: string;
      confirmation?: string;
    };

    const submissionId = String(body.submissionId ?? "").trim();
    const confirmation = String(body.confirmation ?? "").trim();

    if (!submissionId) {
      return NextResponse.json(
        { error: "Expense Claim ID is required." },
        { status: 400 },
      );
    }

    const { data: claim, error: claimError } = await service
      .from("financial_submissions")
      .select("id,submission_number,submission_type,status")
      .eq("id", submissionId)
      .single();

    if (claimError || !claim) {
      return NextResponse.json(
        { error: "Expense Claim not found." },
        { status: 404 },
      );
    }

    if (claim.submission_type !== "expense_claim") {
      return NextResponse.json(
        { error: "This record is not an Expense Claim." },
        { status: 400 },
      );
    }

    if (confirmation !== claim.submission_number) {
      return NextResponse.json(
        { error: `Type ${claim.submission_number} exactly to permanently delete it.` },
        { status: 400 },
      );
    }

    const { data: attachments, error: attachmentError } = await service
      .from("financial_attachments")
      .select("id,sharepoint_drive_id,sharepoint_item_id,file_name")
      .eq("submission_id", submissionId);

    if (attachmentError) throw new Error(attachmentError.message);

    const linkedSharePointFiles = (attachments ?? []).filter(
      (attachment) =>
        Boolean(attachment.sharepoint_drive_id) &&
        Boolean(attachment.sharepoint_item_id),
    );

    if (linkedSharePointFiles.length > 0) {
      const graphToken = await getGraphAccessToken();

      for (const attachment of linkedSharePointFiles) {
        await deleteSharePointItem({
          driveId: String(attachment.sharepoint_drive_id),
          itemId: String(attachment.sharepoint_item_id),
          token: graphToken,
        });
      }
    }

    // Remove notifications created for this Finance submission first.
    const { error: notificationError } = await service
      .from("user_notifications")
      .delete()
      .eq("source_table", "financial_submissions")
      .eq("source_record_id", submissionId);

    if (notificationError) {
      // Older databases may not expose these source columns. Do not block an
      // administrator test cleanup solely because notification cleanup differs.
      console.warn("Could not clean Finance notifications:", notificationError.message);
    }

    const childDeletes = [
      service
        .from("financial_submission_events")
        .delete()
        .eq("submission_id", submissionId),
      service
        .from("financial_approvals")
        .delete()
        .eq("submission_id", submissionId),
      service
        .from("financial_attachments")
        .delete()
        .eq("submission_id", submissionId),
      service
        .from("financial_submission_items")
        .delete()
        .eq("submission_id", submissionId),
    ];

    const childResults = await Promise.all(childDeletes);
    const childError = childResults.find((result) => result.error)?.error;

    if (childError) {
      throw new Error(`Could not delete linked Finance records: ${childError.message}`);
    }

    const { error: claimDeleteError } = await service
      .from("financial_submissions")
      .delete()
      .eq("id", submissionId);

    if (claimDeleteError) throw new Error(claimDeleteError.message);

    console.info("Expense Claim permanently deleted", {
      submissionId,
      submissionNumber: claim.submission_number,
      deletedBy: user.id,
      previousStatus: claim.status,
      sharePointFilesDeleted: linkedSharePointFiles.length,
    });

    return NextResponse.json({
      success: true,
      deleted: true,
      submission_id: submissionId,
      submission_number: claim.submission_number,
      sharepoint_files_deleted: linkedSharePointFiles.length,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Expense Claim could not be deleted.";

    if (message === "UNAUTHENTICATED") {
      return NextResponse.json(
        { error: "You must be signed in." },
        { status: 401 },
      );
    }

    if (message === "FORBIDDEN") {
      return NextResponse.json(
        { error: "Administrator access is required to permanently delete an Expense Claim." },
        { status: 403 },
      );
    }

    console.error("EXPENSE CLAIM DELETE ERROR:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

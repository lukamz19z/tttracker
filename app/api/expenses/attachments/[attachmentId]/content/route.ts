import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { getGraphAccessToken } from "@/lib/sharepoint/graph";

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

async function canAccessSubmission({
  admin,
  userId,
  submission,
}: {
  admin: ReturnType<typeof adminClient>;
  userId: string;
  submission: {
    created_by: string;
    submitted_by: string | null;
    submitted_for_employee_id: string | null;
    submission_type: "expense_claim" | "invoice";
  };
}) {
  const [{ data: roleRow }, { data: employee }] = await Promise.all([
    admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("employees")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const role = String(roleRow?.role ?? "").trim().toLowerCase();

  if (["admin", "administrator", "site_admin"].includes(role)) return true;

  const ownsSubmission =
    submission.created_by === userId ||
    submission.submitted_by === userId ||
    Boolean(
      employee?.id &&
        submission.submitted_for_employee_id === employee.id,
    );

  if (ownsSubmission) return true;

  const { data: userRules, error } = await admin
    .from("financial_access_rules")
    .select("can_review_edit,can_approve,can_mark_paid")
    .eq("active", true)
    .eq("principal_type", "user")
    .eq("user_id", userId)
    .or(
      `applies_to.eq.all,applies_to.eq.${submission.submission_type}`,
    );

  if (error) throw new Error(error.message);

  return (userRules ?? []).some(
    (row) => row.can_review_edit || row.can_approve || row.can_mark_paid,
  );
}

function contentDisposition(fileName: string) {
  const safe = fileName.replace(/["\r\n]/g, "");
  return `inline; filename="${safe || "attachment"}"`;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { attachmentId } = await context.params;

    if (!attachmentId) {
      return NextResponse.json(
        { error: "Attachment ID is required." },
        { status: 400 },
      );
    }

    const { admin, user } = await authenticatedUser(request);

    const { data: attachment, error: attachmentError } = await admin
      .from("financial_attachments")
      .select(
        "id,submission_id,file_name,content_type,file_size_bytes,sharepoint_drive_id,sharepoint_item_id",
      )
      .eq("id", attachmentId)
      .single();

    if (attachmentError || !attachment) {
      return NextResponse.json(
        { error: "Attachment not found." },
        { status: 404 },
      );
    }

    const { data: submission, error: submissionError } = await admin
      .from("financial_submissions")
      .select(
        "id,submission_type,created_by,submitted_by,submitted_for_employee_id",
      )
      .eq("id", attachment.submission_id)
      .single();

    if (submissionError || !submission) {
      return NextResponse.json(
        { error: "Financial submission not found." },
        { status: 404 },
      );
    }

    const allowed = await canAccessSubmission({
      admin,
      userId: user.id,
      submission: submission as {
        created_by: string;
        submitted_by: string | null;
        submitted_for_employee_id: string | null;
        submission_type: "expense_claim" | "invoice";
      },
    });

    if (!allowed) {
      return NextResponse.json(
        { error: "You do not have access to this attachment." },
        { status: 403 },
      );
    }

    if (!attachment.sharepoint_drive_id || !attachment.sharepoint_item_id) {
      return NextResponse.json(
        { error: "This attachment is not linked to SharePoint." },
        { status: 409 },
      );
    }

    const token = await getGraphAccessToken();

    const graphResponse = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(
        attachment.sharepoint_drive_id,
      )}/items/${encodeURIComponent(attachment.sharepoint_item_id)}/content`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        redirect: "follow",
      },
    );

    if (!graphResponse.ok) {
      const detail = await graphResponse.text();
      throw new Error(
        `SharePoint attachment could not be loaded (${graphResponse.status}): ${detail}`,
      );
    }

    const bytes = await graphResponse.arrayBuffer();

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type":
          attachment.content_type || "application/octet-stream",
        "Content-Disposition": contentDisposition(attachment.file_name),
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not load the attachment.";

    if (message === "UNAUTHENTICATED") {
      return NextResponse.json(
        { error: "You must be signed in." },
        { status: 401 },
      );
    }

    console.error("FINANCE ATTACHMENT CONTENT ERROR:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

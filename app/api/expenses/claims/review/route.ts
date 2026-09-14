import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import {
  docketEmailShell,
  sendDailyDocketEmail,
} from "@/lib/email/daily-dockets";
import { publishApprovedExpenseClaim } from "@/lib/finance/archive-expense-claim";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReviewAction = "request_changes" | "deny" | "approve" | "mark_paid";

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function serviceClient() {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function requireUser(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";

  if (!token) throw new Error("UNAUTHENTICATED");

  const service = serviceClient();
  const {
    data: { user },
    error,
  } = await service.auth.getUser(token);

  if (error || !user) throw new Error("UNAUTHENTICATED");
  return { service, user };
}

function appUrl() {
  let value = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    ""
  ).trim();

  if (value && !/^https?:\/\//i.test(value)) value = `https://${value}`;
  if (!value) throw new Error("Set NEXT_PUBLIC_APP_URL for TTTracker.");
  return value.replace(/\/$/, "");
}

function money(value: unknown) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(Number(value ?? 0) || 0);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function roleFor(
  service: ReturnType<typeof serviceClient>,
  userId: string,
) {
  const { data } = await service
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  return String(data?.role ?? "").trim().toLowerCase();
}

async function permissionsFor(
  service: ReturnType<typeof serviceClient>,
  userId: string,
  role: string,
) {
  const { data: rules, error } = await service
    .from("financial_access_rules")
    .select("can_review_edit,can_approve,can_mark_paid")
    .eq("active", true)
    .eq("principal_type", "user")
    .eq("user_id", userId)
    .or("applies_to.eq.all,applies_to.eq.expense_claim");

  if (error) throw new Error(error.message);

  const admin = ["admin", "administrator", "site_admin"].includes(role);

  return {
    canReviewEdit:
      admin || (rules ?? []).some((rule) => Boolean(rule.can_review_edit)),
    canApprove:
      admin || (rules ?? []).some((rule) => Boolean(rule.can_approve)),
    canMarkPaid:
      admin || (rules ?? []).some((rule) => Boolean(rule.can_mark_paid)),
  };
}

async function userIdentity(
  service: ReturnType<typeof serviceClient>,
  userId: string,
) {
  const { data } = await service.auth.admin.getUserById(userId);
  const authUser = data.user;

  const email = authUser?.email ?? null;
  const name =
    String(
      authUser?.user_metadata?.full_name ??
        authUser?.user_metadata?.name ??
        email ??
        "TTTracker User",
    ).trim() || "TTTracker User";

  return { name, email };
}

async function submissionRecipients(
  service: ReturnType<typeof serviceClient>,
  submission: {
    created_by: string;
    submitted_by: string | null;
    submitted_for_employee_id: string | null;
  },
) {
  const ids = new Set<string>();
  if (submission.created_by) ids.add(submission.created_by);
  if (submission.submitted_by) ids.add(submission.submitted_by);

  if (submission.submitted_for_employee_id) {
    const { data: employee } = await service
      .from("employees")
      .select("user_id")
      .eq("id", submission.submitted_for_employee_id)
      .maybeSingle();

    if (employee?.user_id) ids.add(String(employee.user_id));
  }

  const users: Array<{ id: string; email: string | null }> = [];

  for (const id of ids) {
    const { data } = await service.auth.admin.getUserById(id);
    users.push({ id, email: data.user?.email ?? null });
  }

  return users;
}

async function notifySubmitter({
  service,
  submission,
  title,
  message,
  eventType,
}: {
  service: ReturnType<typeof serviceClient>;
  submission: {
    id: string;
    project_id: string | null;
    created_by: string;
    submitted_by: string | null;
    submitted_for_employee_id: string | null;
  };
  title: string;
  message: string;
  eventType: string;
}) {
  const recipients = await submissionRecipients(service, submission);

  const rows = recipients.map((recipient) => ({
    user_id: recipient.id,
    event_type: eventType,
    title,
    message,
    severity: "info",
    read_at: null,
    archived_at: null,
    project_id: submission.project_id ?? null,
    fleet_job_id: null,
    asset_type: null,
    asset_id: null,
    docket_id: null,
    action_route: "/expenses/claims",
    action_params: {
      submission_id: submission.id,
      open: submission.id,
      submission_type: "expense_claim",
    },
    source_table: "financial_submissions",
    source_record_id: submission.id,
    created_at: new Date().toISOString(),
  }));

  if (rows.length) {
    const { error } = await service.from("user_notifications").insert(rows);
    if (error) console.error("Expense Claim notification failed", error);
  }

  return recipients;
}

async function sendSubmitterEmail({
  recipients,
  submissionId,
  submissionNumber,
  title,
  body,
}: {
  recipients: Array<{ id: string; email: string | null }>;
  submissionId: string;
  submissionNumber: string;
  title: string;
  body: string;
}) {
  const emails = [
    ...new Set(
      recipients
        .map((recipient) => recipient.email)
        .filter((email): email is string => Boolean(email)),
    ),
  ];

  if (!emails.length) return;

  const url = `${appUrl()}/expenses/claims?open=${encodeURIComponent(
    submissionId,
  )}`;

  await sendDailyDocketEmail({
    to: emails,
    subject: `${title} · ${submissionNumber}`,
    html: docketEmailShell(
      title,
      `
        ${body}
        <p style="margin:24px 0;">
          <a href="${url}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;">
            Open Expense Claim
          </a>
        </p>
      `,
    ),
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/expenses/claims/review",
  });
}

export async function POST(request: Request) {
  try {
    const { service, user } = await requireUser(request);

    const body = (await request.json()) as {
      submissionId?: string;
      action?: ReviewAction;
      comments?: string;
      paymentReference?: string;
    };

    const submissionId = String(body.submissionId ?? "").trim();
    const action = body.action;
    const comments = String(body.comments ?? "").trim();
    const paymentReference = String(body.paymentReference ?? "").trim();

    if (!submissionId) {
      return NextResponse.json(
        { error: "Expense Claim ID is required." },
        { status: 400 },
      );
    }

    if (
      !action ||
      !["request_changes", "deny", "approve", "mark_paid"].includes(action)
    ) {
      return NextResponse.json(
        { error: "Select a valid review action." },
        { status: 400 },
      );
    }

    const { data: submission, error: submissionError } = await service
      .from("financial_submissions")
      .select(
        "id,submission_number,submission_type,status,revision,submitted_for_employee_id,created_by,submitted_by,project_id,description,notes,subtotal_ex_gst,gst_amount,total_amount,submitted_at,approved_at,approved_by_name,created_at",
      )
      .eq("id", submissionId)
      .single();

    if (submissionError || !submission) {
      return NextResponse.json(
        { error: "Expense Claim not found." },
        { status: 404 },
      );
    }

    if (submission.submission_type !== "expense_claim") {
      return NextResponse.json(
        { error: "This submission is not an Expense Claim." },
        { status: 400 },
      );
    }

    const role = await roleFor(service, user.id);
    const permissions = await permissionsFor(service, user.id, role);
    const reviewer = await userIdentity(service, user.id);
    const revision = Math.max(0, Number(submission.revision ?? 0) || 0);
    const now = new Date().toISOString();

    if (action === "request_changes") {
      if (!permissions.canReviewEdit && !permissions.canApprove) {
        return NextResponse.json(
          { error: "You are not configured to review Expense Claims." },
          { status: 403 },
        );
      }

      if (submission.status !== "submitted") {
        return NextResponse.json(
          { error: "Only submitted Expense Claims can have changes requested." },
          { status: 409 },
        );
      }

      if (!comments) {
        return NextResponse.json(
          { error: "Enter what needs to be changed." },
          { status: 400 },
        );
      }

      const { error } = await service
        .from("financial_submissions")
        .update({
          status: "changes_required",
          changes_requested_at: now,
          changes_requested_by: user.id,
          changes_required_reason: comments,
        })
        .eq("id", submission.id)
        .eq("status", "submitted");

      if (error) throw new Error(error.message);

      await service
        .from("financial_approvals")
        .update({
          status: "changes_required",
          reviewer_user_id: user.id,
          reviewer_name: reviewer.name,
          reviewer_email: reviewer.email,
          comments,
          responded_at: now,
        })
        .eq("submission_id", submission.id)
        .eq("revision", revision)
        .eq("status", "pending");

      await service.from("financial_submission_events").insert({
        submission_id: submission.id,
        revision,
        event_type: "changes_requested",
        performed_by: user.id,
        performed_by_name: reviewer.name,
        performed_by_email: reviewer.email,
        comments,
        metadata: { source: "website", previous_status: submission.status },
      });

      const recipients = await notifySubmitter({
        service,
        submission,
        title: `Changes required · ${submission.submission_number}`,
        message: comments,
        eventType: "finance_expense_changes_required",
      });

      try {
        await sendSubmitterEmail({
          recipients,
          submissionId: submission.id,
          submissionNumber: submission.submission_number,
          title: "Expense Claim changes required",
          body: `
            <p>Your Expense Claim requires changes before it can be approved.</p>
            <p><strong>Claim:</strong> ${escapeHtml(submission.submission_number)}</p>
            <p><strong>Amount:</strong> ${escapeHtml(money(submission.total_amount))}</p>
            <div style="margin:18px 0;padding:14px 16px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;">${escapeHtml(comments)}</div>
          `,
        });
      } catch (emailError) {
        console.error("Changes required email failed", emailError);
      }

      return NextResponse.json({ success: true, status: "changes_required" });
    }

    if (action === "deny") {
      if (!permissions.canApprove) {
        return NextResponse.json(
          { error: "You are not configured to deny Expense Claims." },
          { status: 403 },
        );
      }

      if (submission.status !== "submitted") {
        return NextResponse.json(
          { error: "Only submitted Expense Claims can be denied." },
          { status: 409 },
        );
      }

      if (!comments) {
        return NextResponse.json(
          { error: "Enter the reason for denying this Expense Claim." },
          { status: 400 },
        );
      }

      const { error } = await service
        .from("financial_submissions")
        .update({
          status: "rejected",
          rejected_at: now,
          rejection_reason: comments,
        })
        .eq("id", submission.id)
        .eq("status", "submitted");

      if (error) throw new Error(error.message);

      await service
        .from("financial_approvals")
        .update({
          status: "rejected",
          reviewer_user_id: user.id,
          reviewer_name: reviewer.name,
          reviewer_email: reviewer.email,
          comments,
          responded_at: now,
        })
        .eq("submission_id", submission.id)
        .eq("revision", revision)
        .eq("status", "pending");

      await service.from("financial_submission_events").insert({
        submission_id: submission.id,
        revision,
        event_type: "denied",
        performed_by: user.id,
        performed_by_name: reviewer.name,
        performed_by_email: reviewer.email,
        comments,
        metadata: { source: "website", previous_status: submission.status },
      });

      const recipients = await notifySubmitter({
        service,
        submission,
        title: `Expense Claim denied · ${submission.submission_number}`,
        message: comments,
        eventType: "finance_expense_denied",
      });

      try {
        await sendSubmitterEmail({
          recipients,
          submissionId: submission.id,
          submissionNumber: submission.submission_number,
          title: "Expense Claim denied",
          body: `
            <p>Your Expense Claim has been denied.</p>
            <p><strong>Claim:</strong> ${escapeHtml(submission.submission_number)}</p>
            <p><strong>Amount:</strong> ${escapeHtml(money(submission.total_amount))}</p>
            <p><strong>Reason:</strong> ${escapeHtml(comments)}</p>
          `,
        });
      } catch (emailError) {
        console.error("Denied email failed", emailError);
      }

      return NextResponse.json({ success: true, status: "rejected" });
    }

    if (action === "approve") {
      if (!permissions.canApprove) {
        return NextResponse.json(
          { error: "You are not configured to approve Expense Claims." },
          { status: 403 },
        );
      }

      if (submission.status !== "submitted") {
        return NextResponse.json(
          { error: "Only submitted Expense Claims can be approved." },
          { status: 409 },
        );
      }

      /*
       * Publish the controlled approved PDF first. If SharePoint is unavailable,
       * the claim remains submitted instead of becoming approved without its
       * controlled Finance record.
       */
      const published = await publishApprovedExpenseClaim({
        service,
        submission,
        approvedByUserId: user.id,
        approvedByName: reviewer.name,
        approvedByEmail: reviewer.email,
        approvedAt: now,
      });

      const { data: approvedRow, error } = await service
        .from("financial_submissions")
        .update({
          status: "approved",
          approved_at: now,
          approved_by: user.id,
          approved_by_name: reviewer.name,
          approved_by_email: reviewer.email,
          changes_required_reason: null,
          changes_requested_at: null,
        })
        .eq("id", submission.id)
        .eq("status", "submitted")
        .select("id")
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!approvedRow) {
        return NextResponse.json(
          {
            error:
              "The claim changed while approval was being completed. Refresh before trying again.",
          },
          { status: 409 },
        );
      }

      await service
        .from("financial_approvals")
        .update({
          status: "approved",
          reviewer_user_id: user.id,
          reviewer_name: reviewer.name,
          reviewer_email: reviewer.email,
          comments: comments || null,
          responded_at: now,
        })
        .eq("submission_id", submission.id)
        .eq("revision", revision)
        .eq("status", "pending");

      await service.from("financial_submission_events").insert({
        submission_id: submission.id,
        revision,
        event_type: "approved",
        performed_by: user.id,
        performed_by_name: reviewer.name,
        performed_by_email: reviewer.email,
        comments: comments || null,
        metadata: {
          source: "website",
          previous_status: submission.status,
          sharepoint_file_name: published.fileName,
          sharepoint_item_id: published.itemId,
          sharepoint_web_url: published.webUrl,
        },
      });

      const recipients = await notifySubmitter({
        service,
        submission,
        title: `Expense Claim approved · ${submission.submission_number}`,
        message: `${money(submission.total_amount)} has been approved.`,
        eventType: "finance_expense_approved",
      });

      try {
        await sendSubmitterEmail({
          recipients,
          submissionId: submission.id,
          submissionNumber: submission.submission_number,
          title: "Expense Claim approved",
          body: `
            <p>Your Expense Claim has been approved.</p>
            <p><strong>Claim:</strong> ${escapeHtml(submission.submission_number)}</p>
            <p><strong>Amount:</strong> ${escapeHtml(money(submission.total_amount))}</p>
            <p><strong>Approved by:</strong> ${escapeHtml(reviewer.name)}</p>
          `,
        });
      } catch (emailError) {
        console.error("Approval email failed", emailError);
      }

      return NextResponse.json({
        success: true,
        status: "approved",
        approvedAt: now,
        approvedBy: reviewer.name,
        sharepoint: published,
      });
    }

    if (!permissions.canMarkPaid) {
      return NextResponse.json(
        { error: "You are not configured to mark Expense Claims as paid." },
        { status: 403 },
      );
    }

    if (submission.status !== "approved") {
      return NextResponse.json(
        { error: "Only approved Expense Claims can be marked as paid." },
        { status: 409 },
      );
    }

    const { error: paidError } = await service
      .from("financial_submissions")
      .update({
        status: "paid",
        paid_at: now,
        paid_by: user.id,
        payment_reference: paymentReference || null,
      })
      .eq("id", submission.id)
      .eq("status", "approved");

    if (paidError) throw new Error(paidError.message);

    await service.from("financial_submission_events").insert({
      submission_id: submission.id,
      revision,
      event_type: "paid",
      performed_by: user.id,
      performed_by_name: reviewer.name,
      performed_by_email: reviewer.email,
      comments: paymentReference || null,
      metadata: {
        source: "website",
        previous_status: submission.status,
        payment_reference: paymentReference || null,
      },
    });

    const recipients = await notifySubmitter({
      service,
      submission,
      title: `Expense Claim paid · ${submission.submission_number}`,
      message: `${money(submission.total_amount)} has been marked as paid.`,
      eventType: "finance_expense_paid",
    });

    try {
      await sendSubmitterEmail({
        recipients,
        submissionId: submission.id,
        submissionNumber: submission.submission_number,
        title: "Expense Claim paid",
        body: `
          <p>Your Expense Claim has been marked as paid.</p>
          <p><strong>Claim:</strong> ${escapeHtml(submission.submission_number)}</p>
          <p><strong>Amount:</strong> ${escapeHtml(money(submission.total_amount))}</p>
          ${
            paymentReference
              ? `<p><strong>Payment reference:</strong> ${escapeHtml(paymentReference)}</p>`
              : ""
          }
        `,
      });
    } catch (emailError) {
      console.error("Paid email failed", emailError);
    }

    return NextResponse.json({ success: true, status: "paid", paidAt: now });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Expense Claim review failed.";

    if (message === "UNAUTHENTICATED") {
      return NextResponse.json(
        { error: "You must be signed in." },
        { status: 401 },
      );
    }

    console.error("EXPENSE CLAIM REVIEW ERROR:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

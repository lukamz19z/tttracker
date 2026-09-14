import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import {
  docketEmailShell,
  sendDailyDocketEmail,
} from "@/lib/email/daily-dockets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function env(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function serviceClient() {
  return createClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function requireUser(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) throw new Error("UNAUTHENTICATED");

  const service = serviceClient();
  const {
    data: { user },
    error,
  } = await service.auth.getUser(token);

  if (error || !user) throw new Error("UNAUTHENTICATED");
  return { service, user };
}

function baseUrl() {
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

function esc(value: unknown) {
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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { submissionId?: string };
    const submissionId = String(body.submissionId ?? "").trim();

    if (!submissionId) {
      return NextResponse.json(
        { error: "Expense Claim ID is required." },
        { status: 400 },
      );
    }

    const { service, user } = await requireUser(request);

    const { data: claim, error: claimError } = await service
      .from("financial_submissions")
      .select(
        "id,submission_number,submission_type,status,revision,submitted_for_employee_id,created_by,submitted_by,project_id,description,total_amount",
      )
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
        { error: "This is not an Expense Claim." },
        { status: 400 },
      );
    }

    if (!["draft", "changes_required"].includes(claim.status)) {
      return NextResponse.json(
        { error: "This Expense Claim cannot be submitted from its current status." },
        { status: 409 },
      );
    }

    const role = await roleFor(service, user.id);
    const { data: employee } = await service
      .from("employees")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    const owns =
      claim.created_by === user.id ||
      claim.submitted_by === user.id ||
      Boolean(
        employee?.id &&
          claim.submitted_for_employee_id === employee.id,
      );

    const isAdmin = ["admin", "administrator", "site_admin"].includes(role);

    if (!owns && !isAdmin) {
      return NextResponse.json(
        { error: "Only the claim owner can submit this Expense Claim." },
        { status: 403 },
      );
    }

    const { data: items, error: itemsError } = await service
      .from("financial_submission_items")
      .select(
        "id,category_id,expense_date,description,amount_inc_gst,project_id,asset_type,vehicle_asset_id,plant_asset_id,fleet_job_id",
      )
      .eq("submission_id", claim.id)
      .order("sort_order");

    if (itemsError) throw new Error(itemsError.message);
    if (!items?.length) {
      return NextResponse.json(
        { error: "Add at least one expense item." },
        { status: 400 },
      );
    }

    if (
      items.some(
        (item) =>
          !item.category_id ||
          !item.expense_date ||
          !String(item.description ?? "").trim() ||
          Number(item.amount_inc_gst ?? 0) <= 0,
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Complete the date, category, description and amount for every expense item.",
        },
        { status: 400 },
      );
    }

    const invalidAllocation = items.find((item) => {
      if (item.vehicle_asset_id && item.plant_asset_id) return true;
      if (item.asset_type === "Vehicle" && !item.vehicle_asset_id) return true;
      if (item.asset_type === "Plant" && !item.plant_asset_id) return true;
      if (item.vehicle_asset_id && item.asset_type !== "Vehicle") return true;
      if (item.plant_asset_id && item.asset_type !== "Plant") return true;
      return false;
    });

    if (invalidAllocation) {
      return NextResponse.json(
        {
          error:
            "One or more expense items has an invalid asset allocation. Re-open the draft and select the asset again.",
        },
        { status: 400 },
      );
    }

    const { data: receipts, error: receiptError } = await service
      .from("financial_attachments")
      .select("item_id")
      .eq("submission_id", claim.id)
      .eq("attachment_type", "receipt");

    if (receiptError) throw new Error(receiptError.message);

    const receiptItems = new Set(
      (receipts ?? []).map((receipt) => String(receipt.item_id ?? "")),
    );

    if (items.some((item) => !receiptItems.has(String(item.id)))) {
      return NextResponse.json(
        {
          error:
            "Upload a receipt for every expense item before submitting for approval.",
        },
        { status: 400 },
      );
    }

    /*
     * Finance approval authority is exact-user based.
     * A website role of Finance does not automatically make the user an approver.
     */
    const { data: reviewerRules, error: reviewerRulesError } = await service
      .from("financial_access_rules")
      .select(
        "user_id,receives_email,receives_in_app,can_review_edit,can_approve",
      )
      .eq("active", true)
      .eq("principal_type", "user")
      .not("user_id", "is", null)
      .or("applies_to.eq.all,applies_to.eq.expense_claim");

    if (reviewerRulesError) throw new Error(reviewerRulesError.message);

    const activeReviewerRules = (reviewerRules ?? []).filter(
      (rule) => rule.can_review_edit || rule.can_approve,
    );

    const reviewerIds = [
      ...new Set(
        activeReviewerRules
          .map((rule) => String(rule.user_id ?? "").trim())
          .filter(Boolean),
      ),
    ];

    if (!reviewerIds.length) {
      return NextResponse.json(
        {
          error:
            "No Expense Claim reviewers are configured in Finance Settings.",
        },
        { status: 400 },
      );
    }

    const oldRevision = Math.max(0, Number(claim.revision ?? 0) || 0);
    const revision =
      claim.status === "changes_required"
        ? oldRevision + 1
        : Math.max(oldRevision, 1);
    const now = new Date().toISOString();

    const { data: updated, error: updateError } = await service
      .from("financial_submissions")
      .update({
        status: "submitted",
        submitted_by: user.id,
        submitted_at: now,
        revision,
        changes_required_reason: null,
        changes_requested_at: null,
      })
      .eq("id", claim.id)
      .in("status", ["draft", "changes_required"])
      .select("id,total_amount")
      .maybeSingle();

    if (updateError) throw new Error(updateError.message);
    if (!updated) {
      return NextResponse.json(
        { error: "The claim changed before submission. Refresh and try again." },
        { status: 409 },
      );
    }

    const { error: approvalError } = await service
      .from("financial_approvals")
      .insert({
        submission_id: claim.id,
        revision,
        status: "pending",
        created_at: now,
      });

    if (approvalError) throw new Error(approvalError.message);

    const { error: eventError } = await service
      .from("financial_submission_events")
      .insert({
        submission_id: claim.id,
        revision,
        event_type:
          claim.status === "changes_required" ? "resubmitted" : "submitted",
        performed_by: user.id,
        comments: null,
        metadata: {
          source: "website",
          previous_status: claim.status,
          reviewer_user_ids: reviewerIds,
        },
      });

    if (eventError) throw new Error(eventError.message);

    const { data: settings } = await service
      .from("financial_settings")
      .select(
        "approval_email_enabled,approval_in_app_enabled,approval_push_enabled",
      )
      .eq("id", true)
      .maybeSingle();

    if (settings?.approval_in_app_enabled !== false) {
      const notificationRows = reviewerIds
        .filter((id) =>
          activeReviewerRules.some(
            (rule) => rule.user_id === id && rule.receives_in_app,
          ),
        )
        .map((id) => ({
          user_id: id,
          event_type: "finance_expense_submitted",
          title: `Expense Claim ${claim.submission_number}`,
          message: `${money(updated.total_amount)} is waiting for review.`,
          severity: "info",
          read_at: null,
          archived_at: null,
          project_id: claim.project_id ?? null,
          fleet_job_id: null,
          asset_type: null,
          asset_id: null,
          docket_id: null,
          action_route: "/expenses/claims",
          action_params: {
            submission_id: claim.id,
            open: claim.id,
            submission_type: "expense_claim",
          },
          source_table: "financial_submissions",
          source_record_id: claim.id,
          created_at: now,
        }));

      if (notificationRows.length) {
        const { error } = await service
          .from("user_notifications")
          .insert(notificationRows);

        if (error) console.error("Finance in-app notification failed", error);
      }
    }

    let emailWarning: string | null = null;

    if (settings?.approval_email_enabled !== false) {
      const emailIds = reviewerIds.filter((id) =>
        activeReviewerRules.some(
          (rule) => rule.user_id === id && rule.receives_email,
        ),
      );

      const recipients: string[] = [];

      for (const id of emailIds) {
        const { data } = await service.auth.admin.getUserById(id);
        if (data.user?.email) recipients.push(data.user.email);
      }

      const uniqueRecipients = [...new Set(recipients)];

      if (uniqueRecipients.length) {
        try {
          const { data: project } = claim.project_id
            ? await service
                .from("projects")
                .select("name,project_number")
                .eq("id", claim.project_id)
                .maybeSingle()
            : { data: null };

          const reviewUrl = `${baseUrl()}/expenses/claims?open=${encodeURIComponent(
            claim.id,
          )}`;

          const html = docketEmailShell(
            "Expense Claim awaiting approval",
            `
              <p>An Expense Claim has been submitted and is ready for review.</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0;border-collapse:collapse;">
                <tr><td style="padding:8px 0;color:#64748b;width:150px;">Claim</td><td style="padding:8px 0;font-weight:600;">${esc(claim.submission_number)}</td></tr>
                <tr><td style="padding:8px 0;color:#64748b;">Project</td><td style="padding:8px 0;font-weight:600;">${esc(project?.name || project?.project_number || "Company / General")}</td></tr>
                <tr><td style="padding:8px 0;color:#64748b;">Description</td><td style="padding:8px 0;font-weight:600;">${esc(claim.description || "Expense Claim")}</td></tr>
                <tr><td style="padding:8px 0;color:#64748b;">Amount</td><td style="padding:8px 0;font-weight:600;">${esc(money(updated.total_amount))}</td></tr>
                <tr><td style="padding:8px 0;color:#64748b;">Revision</td><td style="padding:8px 0;font-weight:600;">R${String(revision).padStart(2, "0")}</td></tr>
              </table>
              <p>Open TTTracker to inspect the claim and its receipts. Approval still requires the reviewer to be signed in.</p>
              <p style="margin:24px 0;"><a href="${reviewUrl}" style="display:inline-block;background:#047857;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;">Review Expense Claim</a></p>
            `,
          );

          await sendDailyDocketEmail({
            to: uniqueRecipients,
            subject: `Expense Claim approval required · ${claim.submission_number}`,
            html,
          });
        } catch (error) {
          console.error("Expense Claim reviewer email failed", error);
          emailWarning =
            "The claim was submitted, but reviewer email could not be sent.";
        }
      }
    }

    return NextResponse.json({
      success: true,
      status: "submitted",
      revision,
      reviewers: reviewerIds.length,
      warning: emailWarning,
      pushEnabled: settings?.approval_push_enabled !== false,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The Expense Claim could not be submitted.";

    if (message === "UNAUTHENTICATED") {
      return NextResponse.json(
        { error: "You must be signed in." },
        { status: 401 },
      );
    }

    console.error("EXPENSE CLAIM SUBMIT ERROR:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

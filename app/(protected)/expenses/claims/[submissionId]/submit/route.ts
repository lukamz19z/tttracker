import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { docketEmailShell, sendDailyDocketEmail } from "@/lib/email/daily-dockets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ submissionId: string }> };

function env(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function serviceClient() {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function requireUser(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) throw new Error("UNAUTHENTICATED");

  const service = serviceClient();
  const { data: { user }, error } = await service.auth.getUser(token);
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
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" })
    .format(Number(value ?? 0) || 0);
}

function esc(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function roleFor(service: ReturnType<typeof serviceClient>, userId: string) {
  const { data } = await service.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
  return String(data?.role ?? "").trim().toLowerCase();
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { submissionId } = await context.params;
    const { service, user } = await requireUser(request);

    const { data: claim, error: claimError } = await service
      .from("financial_submissions")
      .select("id,submission_number,submission_type,status,revision,submitted_for_employee_id,created_by,submitted_by,project_id,description,total_amount")
      .eq("id", submissionId)
      .single();

    if (claimError || !claim) return NextResponse.json({ error: "Expense Claim not found." }, { status: 404 });
    if (claim.submission_type !== "expense_claim") return NextResponse.json({ error: "This is not an Expense Claim." }, { status: 400 });
    if (!["draft", "submitted", "changes_required"].includes(claim.status)) {
      return NextResponse.json({ error: "This Expense Claim cannot be submitted from its current status." }, { status: 409 });
    }

    const role = await roleFor(service, user.id);
    const { data: employee } = await service.from("employees").select("id").eq("user_id", user.id).maybeSingle();

    const { data: permissionRules } = await service
      .from("financial_access_rules")
      .select("principal_type,role,user_id,can_review_edit,can_approve")
      .eq("active", true)
      .or("applies_to.eq.all,applies_to.eq.expense_claim");

    const canReview = (permissionRules ?? []).some((r) =>
      (r.can_review_edit || r.can_approve) &&
      ((r.principal_type === "user" && r.user_id === user.id) ||
       (r.principal_type === "role" && String(r.role ?? "").toLowerCase() === role))
    );

    const owns =
      claim.created_by === user.id ||
      claim.submitted_by === user.id ||
      Boolean(employee?.id && claim.submitted_for_employee_id === employee.id);

    if (!owns && !canReview && role !== "admin") {
      return NextResponse.json({ error: "You do not have access to submit this Expense Claim." }, { status: 403 });
    }

    const { data: items, error: itemsError } = await service
      .from("financial_submission_items")
      .select("id,category_id,expense_date,description,amount_inc_gst")
      .eq("submission_id", claim.id)
      .order("sort_order");

    if (itemsError) throw new Error(itemsError.message);
    if (!items?.length) return NextResponse.json({ error: "Add at least one expense item." }, { status: 400 });

    if (items.some((i) => !i.category_id || !i.expense_date || !String(i.description ?? "").trim() || Number(i.amount_inc_gst ?? 0) <= 0)) {
      return NextResponse.json({ error: "Complete the date, category, description and amount for every expense item." }, { status: 400 });
    }

    const { data: receipts, error: receiptError } = await service
      .from("financial_attachments")
      .select("item_id")
      .eq("submission_id", claim.id)
      .eq("attachment_type", "receipt");

    if (receiptError) throw new Error(receiptError.message);
    const receiptItems = new Set((receipts ?? []).map((r) => String(r.item_id ?? "")));

    if (items.some((i) => !receiptItems.has(String(i.id)))) {
      return NextResponse.json({ error: "Upload a receipt for every expense item before submitting for approval." }, { status: 400 });
    }

    const { data: rules, error: rulesError } = await service
      .from("financial_access_rules")
      .select("principal_type,role,user_id,receives_email,receives_in_app,can_review_edit,can_approve")
      .eq("active", true)
      .or("applies_to.eq.all,applies_to.eq.expense_claim");

    if (rulesError) throw new Error(rulesError.message);
    const reviewerRules = (rules ?? []).filter((r) => r.can_review_edit || r.can_approve);

    const reviewerIds = new Set<string>();
    for (const r of reviewerRules) if (r.principal_type === "user" && r.user_id) reviewerIds.add(String(r.user_id));

    const reviewerRoles = [...new Set(reviewerRules.filter((r) => r.principal_type === "role" && r.role).map((r) => String(r.role).toLowerCase()))];
    if (reviewerRoles.length) {
      const { data: usersByRole } = await service.from("user_roles").select("user_id,role").in("role", reviewerRoles);
      for (const row of usersByRole ?? []) reviewerIds.add(String(row.user_id));
    }

    if (!reviewerIds.size) {
      return NextResponse.json({ error: "No Expense Claim reviewers are configured in Expenses → Settings." }, { status: 400 });
    }

    const oldRevision = Math.max(0, Number(claim.revision ?? 0) || 0);
    const revision = claim.status === "changes_required" ? oldRevision + 1 : Math.max(oldRevision, 1);
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
      .in("status", ["draft", "submitted", "changes_required"])
      .select("id,total_amount")
      .maybeSingle();

    if (updateError) throw new Error(updateError.message);
    if (!updated) return NextResponse.json({ error: "The claim changed before submission. Refresh and try again." }, { status: 409 });

    await service.from("financial_approvals").insert({
      submission_id: claim.id,
      revision,
      status: "pending",
      created_at: now,
    });

    await service.from("financial_submission_events").insert({
      submission_id: claim.id,
      revision,
      event_type: claim.status === "changes_required" ? "resubmitted" : "submitted",
      performed_by: user.id,
      comments: null,
      metadata: { source: "website", previous_status: claim.status },
    });

    const { data: settings } = await service
      .from("financial_settings")
      .select("approval_email_enabled,approval_in_app_enabled,approval_push_enabled")
      .eq("id", true)
      .maybeSingle();

    const reviewerIdsArray = [...reviewerIds];
    const { data: roleRows } = reviewerIdsArray.length
      ? await service.from("user_roles").select("user_id,role").in("user_id", reviewerIdsArray)
      : { data: [] };
    const roleMap = new Map((roleRows ?? []).map((r) => [String(r.user_id), String(r.role ?? "").toLowerCase()]));

    const applies = (rule: (typeof reviewerRules)[number], id: string) =>
      rule.principal_type === "user"
        ? rule.user_id === id
        : String(rule.role ?? "").toLowerCase() === (roleMap.get(id) ?? "");

    if (settings?.approval_in_app_enabled !== false) {
      const notificationRows = reviewerIdsArray
        .filter((id) => reviewerRules.some((r) => r.receives_in_app && applies(r, id)))
        .map((id) => ({
          user_id: id,
          event_type: "expense_claim_submitted",
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
          action_params: { submission_id: claim.id, submission_type: "expense_claim" },
          source_table: "financial_submissions",
          source_record_id: claim.id,
          created_at: now,
        }));

      if (notificationRows.length) {
        const { error } = await service.from("user_notifications").insert(notificationRows);
        if (error) console.error("Finance in-app notification failed", error);
      }
    }

    let emailWarning: string | null = null;
    if (settings?.approval_email_enabled !== false) {
      const emailIds = reviewerIdsArray.filter((id) =>
        reviewerRules.some((r) => r.receives_email && applies(r, id)),
      );

      const recipients: Array<{ email: string; id: string }> = [];
      for (const id of emailIds) {
        const { data } = await service.auth.admin.getUserById(id);
        if (data.user?.email) recipients.push({ id, email: data.user.email });
      }

      if (recipients.length) {
        try {
          const { data: project } = claim.project_id
            ? await service.from("projects").select("name,project_number").eq("id", claim.project_id).maybeSingle()
            : { data: null };

          const reviewUrl = `${baseUrl()}/expenses/claims?open=${encodeURIComponent(claim.id)}`;
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
              <p>Open TTTracker to review the claim and its receipts. This link does not approve the claim automatically.</p>
              <p style="margin:24px 0;"><a href="${reviewUrl}" style="display:inline-block;background:#047857;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;">Review &amp; Approve</a></p>
            `,
          );

          await sendDailyDocketEmail({
            to: recipients.map((r) => r.email),
            subject: `Expense Claim approval required · ${claim.submission_number}`,
            html,
          });
        } catch (error) {
          console.error("Expense Claim reviewer email failed", error);
          emailWarning = "The claim was submitted, but reviewer email could not be sent.";
        }
      }
    }

    return NextResponse.json({
      success: true,
      status: "submitted",
      revision,
      reviewers: reviewerIds.size,
      warning: emailWarning,
      pushEnabled: settings?.approval_push_enabled !== false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The Expense Claim could not be submitted.";
    if (message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }
    console.error("EXPENSE CLAIM SUBMIT ERROR:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";

import { effectivePermissionsForUser } from "@/lib/access/server";
import { requireMobileUser, mobileApiError } from "@/lib/mobile/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RoleSummary = {
  id: string;
  code: string;
  name: string;
  description: string | null;
};

type RoleAssignmentRow = {
  roles: RoleSummary | RoleSummary[] | null;
};

type ProjectRow = {
  project_id: string;
  role: string | null;
  projects:
    | {
        id: string;
        name: string;
        project_number: string | null;
        status: string | null;
      }
    | Array<{
        id: string;
        name: string;
        project_number: string | null;
        status: string | null;
      }>
    | null;
};

type FinanceRule = {
  applies_to: "all" | "expense_claim" | "invoice";
  can_review_edit: boolean | null;
  can_approve: boolean | null;
  can_mark_paid: boolean | null;
  receives_email: boolean | null;
  receives_in_app: boolean | null;
  receives_push: boolean | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function firstRole(value: RoleAssignmentRow["roles"]): RoleSummary | null {
  return one(value);
}

function applies(rule: FinanceRule, type: "expense_claim" | "invoice") {
  return rule.applies_to === "all" || rule.applies_to === type;
}

export async function GET(request: NextRequest) {
  try {
    const { service, identity } = await requireMobileUser(request);

    const [
      permissionRows,
      roleRows,
      projectRows,
      navResult,
      settingsResult,
      financeResult,
      docketReviewerResult,
    ] = await Promise.all([
      effectivePermissionsForUser(service, identity.userId),
      service
        .from("user_role_assignments")
        .select("role_id,roles(id,code,name,description)")
        .eq("user_id", identity.userId),
      service
        .from("project_access")
        .select("project_id,role,projects(id,name,project_number,status)")
        .eq("user_id", identity.userId),
      service
        .from("mobile_navigation_items")
        .select("code,section_code,section_label,section_sort_order,label,route,icon_key,permission_code,capability_key,requires_project,sort_order,active")
        .eq("active", true)
        .order("section_sort_order")
        .order("sort_order"),
      service
        .from("system_app_settings")
        .select("product_name,software_owner_name,software_owner_abn,support_email,privacy_url,terms_url,footer_text,updated_at")
        .eq("id", true)
        .maybeSingle(),
      service
        .from("financial_access_rules")
        .select("applies_to,can_review_edit,can_approve,can_mark_paid,receives_email,receives_in_app,receives_push")
        .eq("principal_type", "user")
        .eq("user_id", identity.userId)
        .eq("active", true),
      service
        .from("project_docket_approval_users")
        .select("project_id")
        .eq("user_id", identity.userId)
        .eq("receives_bc_review", true),
    ]);

    for (const result of [roleRows, projectRows, navResult, settingsResult, financeResult, docketReviewerResult]) {
      if (result.error) throw new Error(result.error.message);
    }

    const financeRules = (financeResult.data ?? []) as FinanceRule[];
    const expenseRules = financeRules.filter((rule) => applies(rule, "expense_claim"));
    const invoiceRules = financeRules.filter((rule) => applies(rule, "invoice"));

    const capabilities = {
      expense: {
        canReviewEdit: expenseRules.some((rule) => rule.can_review_edit === true),
        canApprove: expenseRules.some((rule) => rule.can_approve === true),
        canMarkPaid: expenseRules.some((rule) => rule.can_mark_paid === true),
      },
      invoice: {
        canReviewEdit: invoiceRules.some((rule) => rule.can_review_edit === true),
        canApprove: invoiceRules.some((rule) => rule.can_approve === true),
        canMarkPaid: invoiceRules.some((rule) => rule.can_mark_paid === true),
      },
      docketReviewerProjectIds: Array.from(
        new Set((docketReviewerResult.data ?? []).map((row) => String(row.project_id))),
      ),
    };

    const docketProjects = capabilities.docketReviewerProjectIds;
    const [docketCountResult, expenseCountResult, invoiceCountResult] = await Promise.all([
      docketProjects.length
        ? service
            .from("tower_daily_dockets")
            .select("id", { count: "exact", head: true })
            .in("project_id", docketProjects)
            .in("approval_status", ["submitted_bc", "client_changes_requested"])
        : Promise.resolve({ count: 0, error: null }),
      capabilities.expense.canReviewEdit || capabilities.expense.canApprove
        ? service
            .from("financial_submissions")
            .select("id", { count: "exact", head: true })
            .eq("submission_type", "expense_claim")
            .eq("status", "submitted")
        : Promise.resolve({ count: 0, error: null }),
      capabilities.invoice.canReviewEdit || capabilities.invoice.canApprove
        ? service
            .from("financial_submissions")
            .select("id", { count: "exact", head: true })
            .eq("submission_type", "invoice")
            .eq("status", "submitted")
        : Promise.resolve({ count: 0, error: null }),
    ]);

    if (docketCountResult.error) throw new Error(docketCountResult.error.message);
    if (expenseCountResult.error) throw new Error(expenseCountResult.error.message);
    if (invoiceCountResult.error) throw new Error(invoiceCountResult.error.message);

    const approvalCounts = {
      dailyDockets: docketCountResult.count ?? 0,
      expenseClaims: expenseCountResult.count ?? 0,
      invoices: invoiceCountResult.count ?? 0,
    };

    const hasApprovals =
      approvalCounts.dailyDockets + approvalCounts.expenseClaims + approvalCounts.invoices > 0 ||
      docketProjects.length > 0 ||
      capabilities.expense.canReviewEdit ||
      capabilities.expense.canApprove ||
      capabilities.expense.canMarkPaid ||
      capabilities.invoice.canReviewEdit ||
      capabilities.invoice.canApprove ||
      capabilities.invoice.canMarkPaid;

    const permissions = permissionRows
      .filter((row) => row.type === "mobile" && row.allowed === true)
      .map((row) => row.code);

    const roles = ((roleRows.data ?? []) as RoleAssignmentRow[])
      .map((row) => firstRole(row.roles))
      .filter((role): role is RoleSummary => role !== null);

    const projects = ((projectRows.data ?? []) as ProjectRow[])
      .map((row) => {
        const project = one(row.projects);
        if (!project) return null;
        return {
          id: project.id,
          name: project.name,
          projectNumber: project.project_number,
          status: project.status,
          accessRole: row.role,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    return NextResponse.json({
      user: {
        id: identity.userId,
        email: identity.email,
      },
      employee: {
        id: identity.employeeId,
        fullName: identity.fullName,
        position: identity.employeeRole,
        crewId: identity.crewId,
        crewNumber: identity.crewNumber,
        crewName: identity.crewName,
        currentProjectId: identity.currentProjectId,
      },
      roles,
      projects,
      permissions,
      navigation: navResult.data ?? [],
      app: settingsResult.data ?? {
        product_name: "TTTracker",
        software_owner_name: "LMZ Contracting",
        software_owner_abn: null,
        support_email: null,
        privacy_url: null,
        terms_url: null,
        footer_text: "TTTracker · LMZ Contracting",
      },
      capabilities: {
        ...capabilities,
        hasApprovals,
      },
      approvalCounts,
    });
  } catch (error) {
    const apiError = mobileApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

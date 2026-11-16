import { NextRequest, NextResponse } from "next/server";

import { effectivePermissionsForUser } from "@/lib/access/server";
import { requireMobileUser, mobileApiError } from "@/lib/mobile/server";
import { mobilePerfTrace } from "@/lib/mobile/perf-trace";

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
  const startedAt = Date.now();
  const trace = mobilePerfTrace(request);
  const mark = (phase: string, since: number, fields: Record<string, string | number | boolean | null> = {}) => trace?.log(phase, { durationMs: Date.now() - since, ...fields });
  trace?.log("handler-start", { at: new Date().toISOString() });
  try {
    const { service, identity } = await requireMobileUser(request);
    mark("auth-session-validated", startedAt, { userId: identity.userId, currentProjectId: identity.currentProjectId });
    const configStartedAt = Date.now();
    const projectAccessStartedAt = Date.now();
    const projectAccessRead = service
      .from("project_access")
      .select("project_id,role,projects(id,name,project_number,status)")
      .eq("user_id", identity.userId)
      .then((result) => {
        if (result.error) {
          trace?.log("access-failed", { userId: identity.userId, category: "project_access_query", errorCode: result.error.code ?? null, durationMs: Date.now() - projectAccessStartedAt });
        } else {
          trace?.log("access-ok", { userId: identity.userId, authorizedProjectCount: result.data?.length ?? 0, durationMs: Date.now() - projectAccessStartedAt });
        }
        return result;
      });

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
      projectAccessRead,
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
    mark("profile-and-access-queries", configStartedAt);

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
    const hasApprovals =
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
    trace?.log("current-project-resolution", {
      userId: identity.userId,
      currentProjectId: identity.currentProjectId,
      currentProjectAuthorized: identity.currentProjectId ? projects.some((project) => project.id === identity.currentProjectId) : false,
      authorizedProjectCount: projects.length,
    });

    const serializeStartedAt = Date.now();
    const response = NextResponse.json({
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
    });
    mark("response-serialization", serializeStartedAt);
    mark("handler-end", startedAt, { httpStatus: 200 });
    if (trace) response.headers.set("x-tttracker-trace-id", trace.id);
    return response;
  } catch (error) {
    const apiError = mobileApiError(error);
    trace?.log("error", {
      httpStatus: apiError.status,
      category: apiError.status === 401 ? "authentication" : apiError.status === 403 ? "authorization" : "handler_failure",
      durationMs: Date.now() - startedAt,
    });
    trace?.log("handler-end", { httpStatus: apiError.status, durationMs: Date.now() - startedAt });
    const response = NextResponse.json({ error: apiError.message }, { status: apiError.status });
    if (trace) response.headers.set("x-tttracker-trace-id", trace.id);
    return response;
  }
}

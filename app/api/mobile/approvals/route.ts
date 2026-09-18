import { NextRequest, NextResponse } from "next/server";

import { mobileApiError, requireMobileUser } from "@/lib/mobile/server";
import {
  docketReviewerProjectIds,
  financeCapabilitiesForUser,
} from "@/lib/mobile/approvals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

const clean = (value: unknown) => String(value ?? "").trim();

const unique = (values: unknown[]) =>
  Array.from(new Set(values.map(clean).filter(Boolean)));

const mapById = (rows: Row[]) =>
  new Map(
    rows
      .map((row) => [clean(row.id), row] as const)
      .filter(([id]) => Boolean(id)),
  );

export async function GET(request: NextRequest) {
  try {
    const { service, identity } = await requireMobileUser(request);

    const [reviewProjectIds, finance] = await Promise.all([
      docketReviewerProjectIds(service, identity.userId),
      financeCapabilitiesForUser(service, identity.userId),
    ]);

    const [docketResult, expenseResult, invoiceResult] = await Promise.all([
      reviewProjectIds.length
        ? service
            .from("tower_daily_dockets")
            .select(
              "id,project_id,tower_id,docket_date,crew,leading_hand,approval_status,approval_revision,raw_manhours,production_manhours,bc_submitted_at",
            )
            .in("project_id", reviewProjectIds)
            .in("approval_status", ["submitted_bc", "client_changes_requested"])
            .order("bc_submitted_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),

      finance.expense.canReviewEdit ||
      finance.expense.canApprove ||
      finance.expense.canMarkPaid
        ? service
            .from("financial_submissions")
            .select(
              "id,submission_number,submission_type,status,project_id,submitted_for_employee_id,created_by,submitted_by,description,total_amount,submitted_at,approved_at,created_at",
            )
            .eq("submission_type", "expense_claim")
            .in(
              "status",
              finance.expense.canMarkPaid
                ? ["submitted", "approved"]
                : ["submitted"],
            )
            .order("submitted_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),

      finance.invoice.canReviewEdit ||
      finance.invoice.canApprove ||
      finance.invoice.canMarkPaid
        ? service
            .from("financial_submissions")
            .select(
              "id,submission_number,submission_type,status,project_id,supplier_name,invoice_number,invoice_date,due_date,description,total_amount,submitted_at,approved_at,created_at",
            )
            .eq("submission_type", "invoice")
            .in(
              "status",
              finance.invoice.canMarkPaid
                ? ["submitted", "approved"]
                : ["submitted"],
            )
            .order("submitted_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);

    for (const result of [docketResult, expenseResult, invoiceResult]) {
      if (result.error) throw new Error(result.error.message);
    }

    const docketRows = (docketResult.data ?? []) as Row[];
    const expenseRows = (expenseResult.data ?? []) as Row[];
    const invoiceRows = (invoiceResult.data ?? []) as Row[];

    const projectIds = unique([
      ...docketRows.map((row) => row.project_id),
      ...expenseRows.map((row) => row.project_id),
      ...invoiceRows.map((row) => row.project_id),
    ]);

    const towerIds = unique(
      docketRows.map((row) => row.tower_id),
    );

    const [projectsResult, towersResult] = await Promise.all([
      projectIds.length
        ? service
            .from("projects")
            .select("id,name,project_number")
            .in("id", projectIds)
        : Promise.resolve({ data: [], error: null }),

      towerIds.length
        ? service
            .from("towers")
            .select("id,name")
            .in("id", towerIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (projectsResult.error) {
      throw new Error(
        `Approval projects could not be loaded: ${projectsResult.error.message}`,
      );
    }

    if (towersResult.error) {
      throw new Error(
        `Approval towers could not be loaded: ${towersResult.error.message}`,
      );
    }

    const projectsById = mapById(
      (projectsResult.data ?? []) as Row[],
    );
    const towersById = mapById(
      (towersResult.data ?? []) as Row[],
    );

    const dailyDockets = docketRows.map((row) => ({
      ...row,
      projects:
        projectsById.get(clean(row.project_id)) ?? null,
      towers:
        towersById.get(clean(row.tower_id)) ?? null,
    }));

    const expenseClaims = expenseRows.map((row) => ({
      ...row,
      projects:
        projectsById.get(clean(row.project_id)) ?? null,
    }));

    const invoices = invoiceRows.map((row) => ({
      ...row,
      projects:
        projectsById.get(clean(row.project_id)) ?? null,
    }));

    return NextResponse.json({
      capabilities: {
        dailyDockets: { projectIds: reviewProjectIds },
        expense: finance.expense,
        invoice: finance.invoice,
      },
      dailyDockets,
      expenseClaims,
      invoices,
    });
  } catch (error) {
    const apiError = mobileApiError(error);

    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}

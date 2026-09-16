import { NextRequest, NextResponse } from "next/server";

import { mobileApiError, requireMobileUser } from "@/lib/mobile/server";
import {
  docketReviewerProjectIds,
  financeCapabilitiesForUser,
} from "@/lib/mobile/approvals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { service, identity } = await requireMobileUser(request);
    const [projectIds, finance] = await Promise.all([
      docketReviewerProjectIds(service, identity.userId),
      financeCapabilitiesForUser(service, identity.userId),
    ]);

    const [docketResult, expenseResult, invoiceResult] = await Promise.all([
      projectIds.length
        ? service
            .from("tower_daily_dockets")
            .select("id,project_id,tower_id,docket_date,crew,leading_hand,approval_status,approval_revision,raw_manhours,production_manhours,bc_submitted_at,projects(name,project_number),towers(name)")
            .in("project_id", projectIds)
            .in("approval_status", ["submitted_bc", "client_changes_requested"])
            .order("bc_submitted_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      finance.expense.canReviewEdit || finance.expense.canApprove || finance.expense.canMarkPaid
        ? service
            .from("financial_submissions")
            .select("id,submission_number,submission_type,status,project_id,submitted_for_employee_id,created_by,submitted_by,description,total_amount,submitted_at,approved_at,created_at,projects(name,project_number)")
            .eq("submission_type", "expense_claim")
            .in("status", finance.expense.canMarkPaid ? ["submitted", "approved"] : ["submitted"])
            .order("submitted_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      finance.invoice.canReviewEdit || finance.invoice.canApprove || finance.invoice.canMarkPaid
        ? service
            .from("financial_submissions")
            .select("id,submission_number,submission_type,status,project_id,supplier_name,invoice_number,invoice_date,due_date,description,total_amount,submitted_at,approved_at,created_at,projects(name,project_number)")
            .eq("submission_type", "invoice")
            .in("status", finance.invoice.canMarkPaid ? ["submitted", "approved"] : ["submitted"])
            .order("submitted_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);

    for (const result of [docketResult, expenseResult, invoiceResult]) {
      if (result.error) throw new Error(result.error.message);
    }

    return NextResponse.json({
      capabilities: {
        dailyDockets: { projectIds },
        expense: finance.expense,
        invoice: finance.invoice,
      },
      dailyDockets: docketResult.data ?? [],
      expenseClaims: expenseResult.data ?? [],
      invoices: invoiceResult.data ?? [],
    });
  } catch (error) {
    const apiError = mobileApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

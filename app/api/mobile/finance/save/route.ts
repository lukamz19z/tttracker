import { NextRequest, NextResponse } from "next/server";
import { mobileApiError, requireMobilePermission } from "@/lib/mobile/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Allocation = {
  id?: string;
  categoryId?: string;
  expenseDate?: string;
  supplier?: string;
  description?: string;
  amountIncGst?: number;
  gstAmount?: number;
  notes?: string;
  projectId?: string;
  vehicleAssetId?: string;
  plantAssetId?: string;
  fleetJobId?: string;
};

type Body = {
  type?: "expense_claim" | "invoice";
  submissionId?: string;
  projectId?: string;
  description?: string;
  notes?: string;
  supplierName?: string;
  supplierAbn?: string;
  supplierContactName?: string;
  supplierEmail?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  receivedDate?: string;
  dueDate?: string;
  paymentTermsDays?: number;
  purchaseOrderNumber?: string;
  subcontractNumber?: string;
  workOrderReference?: string;
  allocations?: Allocation[];
};

const clean = (value: unknown) => String(value ?? "").trim();
const money = (value: unknown) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Body;
    const type = body.type;
    if (type !== "expense_claim" && type !== "invoice") {
      return NextResponse.json({ error: "A valid Finance submission type is required." }, { status: 400 });
    }

    const permission = type === "expense_claim" ? "mobile.expenses" : "mobile.invoices";
    const { service, identity } = await requireMobilePermission(request, permission);
    const allocations = Array.isArray(body.allocations) ? body.allocations : [];
    if (allocations.length === 0) {
      return NextResponse.json({ error: "Add at least one cost item." }, { status: 400 });
    }

    const projectIds = Array.from(new Set([clean(body.projectId), ...allocations.map((row) => clean(row.projectId))].filter(Boolean)));
    if (projectIds.length > 0) {
      const { data, error } = await service.from("project_access").select("project_id").eq("user_id", identity.userId).in("project_id", projectIds);
      if (error) throw new Error(error.message);
      const allowed = new Set((data ?? []).map((row) => String(row.project_id)));
      if (projectIds.some((id) => !allowed.has(id))) {
        return NextResponse.json({ error: "One or more selected projects are not assigned to your TTTracker account." }, { status: 403 });
      }
    }

    const totalInc = allocations.reduce((sum, row) => sum + money(row.amountIncGst), 0);
    const totalGst = allocations.reduce((sum, row) => sum + money(row.gstAmount), 0);
    const totalEx = Math.round((totalInc - totalGst) * 100) / 100;
    if (totalInc < 0 || totalGst < 0 || totalGst > totalInc) {
      return NextResponse.json({ error: "Finance totals are not valid." }, { status: 400 });
    }

    let submissionId = clean(body.submissionId);
    if (submissionId) {
      const { data: existing, error } = await service.from("financial_submissions").select("id,created_by,submission_type,status").eq("id", submissionId).maybeSingle();
      if (error) throw new Error(error.message);
      if (!existing || existing.submission_type !== type) return NextResponse.json({ error: "Submission not found." }, { status: 404 });
      if (existing.created_by !== identity.userId) return NextResponse.json({ error: "You can only edit submissions you created." }, { status: 403 });
      if (!["draft", "changes_required"].includes(String(existing.status))) return NextResponse.json({ error: "This submission is locked while approval is in progress or complete." }, { status: 409 });
    }

    const submissionPayload = type === "expense_claim"
      ? {
          project_id: clean(body.projectId) || null,
          submitted_for_employee_id: identity.employeeId,
          description: clean(body.description) || null,
          notes: clean(body.notes) || null,
          subtotal_ex_gst: totalEx,
          gst_amount: totalGst,
          total_amount: totalInc,
          updated_at: new Date().toISOString(),
        }
      : {
          project_id: clean(body.projectId) || null,
          supplier_name: clean(body.supplierName) || null,
          supplier_abn: clean(body.supplierAbn) || null,
          supplier_contact_name: clean(body.supplierContactName) || null,
          supplier_email: clean(body.supplierEmail) || null,
          invoice_number: clean(body.invoiceNumber) || null,
          invoice_date: clean(body.invoiceDate) || null,
          received_date: clean(body.receivedDate) || null,
          due_date: clean(body.dueDate) || null,
          payment_terms_days: Number(body.paymentTermsDays ?? 0) || null,
          purchase_order_number: clean(body.purchaseOrderNumber) || null,
          subcontract_number: clean(body.subcontractNumber) || null,
          work_order_reference: clean(body.workOrderReference) || null,
          currency_code: "AUD",
          description: clean(body.description) || null,
          notes: clean(body.notes) || null,
          subtotal_ex_gst: totalEx,
          gst_amount: totalGst,
          total_amount: totalInc,
          updated_at: new Date().toISOString(),
        };

    if (submissionId) {
      const { error } = await service.from("financial_submissions").update(submissionPayload).eq("id", submissionId);
      if (error) throw new Error(error.message);
    } else {
      const { data, error } = await service.from("financial_submissions").insert({
        ...submissionPayload,
        submission_type: type,
        status: "draft",
        revision: 0,
        created_by: identity.userId,
        submitted_by: null,
        submitted_at: null,
      }).select("id").single();
      if (error) throw new Error(error.message);
      submissionId = String(data.id);
    }

    const { error: deleteError } = await service.from("financial_submission_items").delete().eq("submission_id", submissionId);
    if (deleteError) throw new Error(deleteError.message);

    const rows = allocations.map((row, index) => {
      const inc = money(row.amountIncGst);
      const gst = money(row.gstAmount);
      const ex = Math.round((inc - gst) * 100) / 100;
      return {
        submission_id: submissionId,
        category_id: clean(row.categoryId) || null,
        expense_date: clean(row.expenseDate || body.invoiceDate) || new Date().toISOString().slice(0, 10),
        supplier: clean(row.supplier || body.supplierName) || null,
        description: clean(row.description) || `Item ${index + 1}`,
        quantity: 1,
        unit_amount_ex_gst: ex,
        amount_ex_gst: ex,
        gst_amount: gst,
        amount_inc_gst: inc,
        notes: clean(row.notes) || null,
        sort_order: index,
        project_id: clean(row.projectId || body.projectId) || null,
        gst_applicable: gst > 0,
        asset_type: clean(row.vehicleAssetId) ? "Vehicle" : clean(row.plantAssetId) ? "Plant" : null,
        vehicle_asset_id: clean(row.vehicleAssetId) || null,
        plant_asset_id: clean(row.plantAssetId) || null,
        fleet_job_id: clean(row.fleetJobId) || null,
      };
    });

    const { data: savedItems, error: itemError } = await service.from("financial_submission_items").insert(rows).select("id,sort_order,description,amount_inc_gst").order("sort_order");
    if (itemError) throw new Error(itemError.message);

    return NextResponse.json({ success: true, submissionId, items: savedItems ?? [], totals: { subtotalExGst: totalEx, gstAmount: totalGst, totalAmount: totalInc } });
  } catch (error) {
    const apiError = mobileApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

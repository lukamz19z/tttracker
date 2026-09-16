import { NextRequest, NextResponse } from "next/server";

import { mobileApiError, requireMobilePermission } from "@/lib/mobile/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const type = request.nextUrl.searchParams.get("type") === "invoice" ? "invoice" : "expense_claim";
    const permission = type === "invoice" ? "mobile.invoices" : "mobile.expenses";
    const { service, identity } = await requireMobilePermission(request, permission);

    const [submissionResult, categoryResult, projectResult, vehicleResult, plantResult, fleetJobResult] = await Promise.all([
      service
        .from("financial_submissions")
        .select("*")
        .eq("submission_type", type)
        .or(
          type === "expense_claim"
            ? `created_by.eq.${identity.userId},submitted_by.eq.${identity.userId}${identity.employeeId ? `,submitted_for_employee_id.eq.${identity.employeeId}` : ""}`
            : `created_by.eq.${identity.userId},submitted_by.eq.${identity.userId}`,
        )
        .order("created_at", { ascending: false }),
      service.from("financial_categories").select("id,name,description,active,sort_order").eq("active", true).order("sort_order").order("name"),
      service.from("projects").select("id,name,project_number,status").order("name"),
      service.from("vehicle_assets").select("id,vehicle_id,vehicle_rego,make,model,category,status").order("vehicle_id"),
      service.from("plant_assets").select("id,asset_id,make,model,plant_type,serial_number,rego,asset_status").order("asset_id"),
      service.from("fleet_jobs").select("id,job_number,asset_type,vehicle_asset_id,plant_asset_id,asset_label,status").order("created_at", { ascending: false }).limit(500),
    ]);

    for (const result of [submissionResult, categoryResult, projectResult, vehicleResult, plantResult, fleetJobResult]) {
      if (result.error) throw new Error(result.error.message);
    }

    const submissions = submissionResult.data ?? [];
    const ids = submissions.map((row) => row.id);
    const [itemsResult, attachmentsResult] = ids.length
      ? await Promise.all([
          service.from("financial_submission_items").select("*").in("submission_id", ids).order("sort_order"),
          service.from("financial_attachments").select("id,submission_id,item_id,attachment_type,file_name,content_type,file_size_bytes,uploaded_at").in("submission_id", ids).order("uploaded_at", { ascending: false }),
        ])
      : [{ data: [], error: null }, { data: [], error: null }];

    if (itemsResult.error) throw new Error(itemsResult.error.message);
    if (attachmentsResult.error) throw new Error(attachmentsResult.error.message);

    return NextResponse.json({
      type,
      employeeId: identity.employeeId,
      submissions,
      items: itemsResult.data ?? [],
      attachments: attachmentsResult.data ?? [],
      categories: categoryResult.data ?? [],
      projects: projectResult.data ?? [],
      vehicles: vehicleResult.data ?? [],
      plant: plantResult.data ?? [],
      fleetJobs: fleetJobResult.data ?? [],
    });
  } catch (error) {
    const apiError = mobileApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

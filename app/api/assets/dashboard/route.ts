import { NextResponse } from "next/server";

import {
  assetApiError,
  canManageAssets,
  canViewAssets,
  requireAssetUser,
} from "@/lib/assets/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function daysUntil(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const target = new Date(`${raw.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.ceil(
    (target.getTime() - today.getTime()) / 86_400_000,
  );
}

export async function GET(request: Request) {
  try {
    const { service, identity } = await requireAssetUser(request);

    if (!canViewAssets(identity.role)) {
      throw new Error("ASSET_VIEW_FORBIDDEN");
    }

    const [
      vehiclesResult,
      plantResult,
      jobsResult,
      servicesResult,
      financeItemsResult,
      documentsResult,
    ] = await Promise.all([
      service
        .from("vehicle_assets")
        .select(
          "id,vehicle_id,vehicle_rego,make,model,status,next_service_due,next_service_km,rego_expiry,insurance_expiry",
        ),
      service
        .from("plant_assets")
        .select(
          "id,asset_id,make,model,asset_status,next_service_due,next_service_hours,next_inspection_due,rego_expiry,insurance_expiry,cranesafe_expiry",
        ),
      service
        .from("fleet_jobs")
        .select(
          "id,job_number,status,priority,asset_label,asset_type,created_at",
        )
        .order("created_at", { ascending: false }),
      service
        .from("asset_service_records")
        .select(
          "id,service_number,asset_type,vehicle_asset_id,plant_asset_id,record_type,service_date,summary,mechanic_name,amount_inc_gst,status,created_at",
        )
        .eq("status", "completed")
        .order("service_date", { ascending: false })
        .limit(12),
      service
        .from("financial_submission_items")
        .select(
          "id,amount_inc_gst,vehicle_asset_id,plant_asset_id,fleet_job_id",
        ),
      service
        .from("asset_documents")
        .select("id,document_category,expiry_date,active")
        .eq("active", true),
    ]);

    if (vehiclesResult.error) throw new Error(vehiclesResult.error.message);
    if (plantResult.error) throw new Error(plantResult.error.message);
    if (jobsResult.error) throw new Error(jobsResult.error.message);
    if (servicesResult.error) throw new Error(servicesResult.error.message);
    if (financeItemsResult.error) {
      throw new Error(financeItemsResult.error.message);
    }
    if (documentsResult.error) throw new Error(documentsResult.error.message);

    const vehicles = vehiclesResult.data ?? [];
    const plant = plantResult.data ?? [];
    const jobs = jobsResult.data ?? [];
    const documents = documentsResult.data ?? [];

    const openJobs = jobs.filter(
      (job) =>
        !["completed", "closed", "cancelled"].includes(
          String(job.status ?? "").trim().toLowerCase(),
        ),
    );

    const dueDates: Array<{
      type: "Vehicle" | "Plant" | "Document";
      label: string;
      date: string;
      days: number;
      href: string;
    }> = [];

    for (const vehicle of vehicles) {
      const label = [
        vehicle.vehicle_id,
        [vehicle.make, vehicle.model].filter(Boolean).join(" "),
      ]
        .filter(Boolean)
        .join(" - ");

      for (const [field, date] of [
        ["Service", vehicle.next_service_due],
        ["Rego", vehicle.rego_expiry],
        ["Insurance", vehicle.insurance_expiry],
      ] as const) {
        const days = daysUntil(date);
        if (days !== null && days <= 60) {
          dueDates.push({
            type: "Vehicle",
            label: `${label || "Vehicle"} · ${field}`,
            date: String(date),
            days,
            href: `/assets/vehicles/${vehicle.id}`,
          });
        }
      }
    }

    for (const item of plant) {
      const label = [
        item.asset_id,
        [item.make, item.model].filter(Boolean).join(" "),
      ]
        .filter(Boolean)
        .join(" - ");

      for (const [field, date] of [
        ["Service", item.next_service_due],
        ["Inspection", item.next_inspection_due],
        ["Rego", item.rego_expiry],
        ["Insurance", item.insurance_expiry],
        ["CraneSafe", item.cranesafe_expiry],
      ] as const) {
        const days = daysUntil(date);
        if (days !== null && days <= 60) {
          dueDates.push({
            type: "Plant",
            label: `${label || "Plant"} · ${field}`,
            date: String(date),
            days,
            href: `/assets/plant/${item.id}`,
          });
        }
      }
    }

    const expiringDocuments = documents.filter((document) => {
      const days = daysUntil(document.expiry_date);
      return days !== null && days <= 60;
    }).length;

    const totalSpend = (financeItemsResult.data ?? []).reduce(
      (sum, row) => {
        const linked =
          Boolean(row.vehicle_asset_id) ||
          Boolean(row.plant_asset_id) ||
          Boolean(row.fleet_job_id);

        return linked
          ? sum + (Number(row.amount_inc_gst ?? 0) || 0)
          : sum;
      },
      0,
    );

    return NextResponse.json({
      counts: {
        vehicles: vehicles.length,
        plant: plant.length,
        openFleetJobs: openJobs.length,
        expiringDocuments,
      },
      totalSpend,
      due: dueDates.sort((a, b) => a.days - b.days).slice(0, 20),
      recentServices: servicesResult.data ?? [],
      recentFleetJobs: jobs.slice(0, 10),
      canManage: canManageAssets(identity.role),
    });
  } catch (error) {
    const apiError = assetApiError(error);
    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}

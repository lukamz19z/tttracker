import { NextResponse } from "next/server";

import {
  assetApiError,
  canManageAssets,
  canViewAssets,
  clean,
  requireAssetUser,
} from "@/lib/assets/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FleetJobRaw = {
  id: string;
  job_number?: string | null;
  asset_type?: string | null;
  vehicle_asset_id?: string | null;
  plant_asset_id?: string | null;
  plant_id?: string | null;
  asset_label?: string | null;
  status?: string | null;
  priority?: string | null;
  created_at?: string | null;
};

export async function GET(request: Request) {
  try {
    const { service, identity } = await requireAssetUser(request);

    if (!canViewAssets(identity.role)) {
      throw new Error("ASSET_VIEW_FORBIDDEN");
    }

    const [
      vehicleResult,
      plantResult,
      fleetResult,
      projectResult,
      employeeResult,
      settingsResult,
      documentTypesResult,
    ] = await Promise.all([
      service.from("vehicle_assets").select("*").order("vehicle_id"),
      service.from("plant_assets").select("*").order("asset_id"),
      service.from("fleet_jobs").select("*").order("created_at", { ascending: false }),
      service.from("projects").select("id,name,project_number,status").order("name"),
      service.from("employees").select("id,full_name,user_id,role,active").eq("active", true).order("full_name"),
      service.from("asset_settings").select("*").eq("id", true).single(),
      service.from("asset_document_types").select("*").eq("active", true).order("sort_order").order("name"),
    ]);

    if (vehicleResult.error) throw new Error(vehicleResult.error.message);
    if (plantResult.error) throw new Error(plantResult.error.message);
    if (fleetResult.error) throw new Error(fleetResult.error.message);
    if (projectResult.error) throw new Error(projectResult.error.message);
    if (employeeResult.error) throw new Error(employeeResult.error.message);
    if (settingsResult.error) throw new Error(settingsResult.error.message);
    if (documentTypesResult.error) throw new Error(documentTypesResult.error.message);

    const fleetJobs = ((fleetResult.data ?? []) as FleetJobRaw[]).map((job) => ({
      ...job,
      vehicle_asset_id: clean(job.vehicle_asset_id) || null,
      plant_asset_id: clean(job.plant_asset_id || job.plant_id) || null,
    }));

    return NextResponse.json({
      vehicles: vehicleResult.data ?? [],
      plant: plantResult.data ?? [],
      fleetJobs,
      projects: projectResult.data ?? [],
      employees: employeeResult.data ?? [],
      settings: settingsResult.data,
      documentTypes: documentTypesResult.data ?? [],
      identity,
      canManage: canManageAssets(identity.role),
    });
  } catch (error) {
    const apiError = assetApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

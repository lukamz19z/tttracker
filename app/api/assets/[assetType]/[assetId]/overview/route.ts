import { NextResponse } from "next/server";

import { loadAssetSpend } from "@/lib/assets/finance";
import {
  assetApiError,
  assetIdColumn,
  assetTable,
  canManageAssets,
  canViewAssets,
  clean,
  parseAssetType,
  requireAssetUser,
  type AssetServiceClient,
} from "@/lib/assets/server";
import { assetLabel } from "@/lib/assets/sharepoint";
import type {
  AssetDocumentRow,
  AssetDocumentTypeRow,
  AssetEventRow,
  AssetRecord,
  AssetServiceRecordRow,
} from "@/lib/assets/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ assetType: string; assetId: string }>;
};

type ServiceItemRow = {
  id: string;
  service_record_id: string;
  sort_order: number;
  issue: string;
  diagnosis: string | null;
  rectification: string | null;
  parts_used: string | null;
  labour_hours: number | string | null;
  item_status: string;
};

type FleetJobRaw = {
  id: string;
  job_number?: string | null;
  title?: string | null;
  description?: string | null;
  status?: string | null;
  priority?: string | null;
  asset_type?: string | null;
  asset_label?: string | null;
  vehicle_asset_id?: string | null;
  plant_asset_id?: string | null;
  plant_id?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
  completed_date?: string | null;
};

async function projectHistory({
  service,
  assetType,
  assetId,
}: {
  service: AssetServiceClient;
  assetType: "vehicle" | "plant";
  assetId: string;
}) {
  const table =
    assetType === "vehicle" ? "vehicle_project_history" : "plant_project_history";
  const idColumn =
    assetType === "vehicle" ? "vehicle_asset_id" : "plant_asset_id";

  const { data, error } = await service
    .from(table)
    .select("*")
    .eq(idColumn, assetId)
    .order("project_onboard_date", { ascending: false });

  if (error) {
    console.warn(`Legacy ${assetType} project history could not be loaded`, error);
    return [];
  }

  return data ?? [];
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { assetType: rawType, assetId } = await context.params;
    const assetType = parseAssetType(rawType);

    if (!assetType) {
      return NextResponse.json(
        { error: "Asset type must be vehicle or plant." },
        { status: 400 },
      );
    }

    const { service, identity } = await requireAssetUser(request);
    if (!canViewAssets(identity.role)) throw new Error("ASSET_VIEW_FORBIDDEN");

    const { data: assetData, error: assetError } = await service
      .from(assetTable(assetType))
      .select("*")
      .eq("id", assetId)
      .maybeSingle();

    if (assetError) throw new Error(assetError.message);
    if (!assetData) {
      return NextResponse.json({ error: "Asset could not be found." }, { status: 404 });
    }

    const asset = assetData as AssetRecord;
    const assetColumn = assetIdColumn(assetType);

    const [
      documentResult,
      serviceResult,
      prestartResult,
      fleetResult,
      eventResult,
      documentTypeResult,
      spend,
      projects,
    ] = await Promise.all([
      service
        .from("asset_documents")
        .select("*")
        .eq(assetColumn, assetId)
        .order("created_at", { ascending: false }),
      service
        .from("asset_service_records")
        .select("*")
        .eq(assetColumn, assetId)
        .order("service_date", { ascending: false })
        .order("created_at", { ascending: false }),
      service
        .from("vehicle_prestarts")
        .select("*")
        .eq(assetColumn, assetId)
        .order("prestart_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100),
      service.from("fleet_jobs").select("*").order("created_at", { ascending: false }),
      service
        .from("asset_events")
        .select("*")
        .eq(assetColumn, assetId)
        .order("event_date", { ascending: false })
        .order("created_at", { ascending: false }),
      service
        .from("asset_document_types")
        .select("*")
        .eq("active", true)
        .or(`applies_to.eq.${assetType},applies_to.eq.both`)
        .order("sort_order")
        .order("name"),
      loadAssetSpend({ service, assetType, assetId }),
      projectHistory({ service, assetType, assetId }),
    ]);

    if (documentResult.error) throw new Error(documentResult.error.message);
    if (serviceResult.error) throw new Error(serviceResult.error.message);
    if (prestartResult.error) {
      console.warn("Asset prestarts could not be loaded", prestartResult.error);
    }
    if (fleetResult.error) throw new Error(fleetResult.error.message);
    if (eventResult.error) throw new Error(eventResult.error.message);
    if (documentTypeResult.error) throw new Error(documentTypeResult.error.message);

    const services = (serviceResult.data ?? []) as AssetServiceRecordRow[];
    let serviceItems: ServiceItemRow[] = [];

    if (services.length > 0) {
      const { data, error } = await service
        .from("asset_service_items")
        .select("*")
        .in(
          "service_record_id",
          services.map((record) => record.id),
        )
        .order("sort_order");

      if (error) throw new Error(error.message);
      serviceItems = (data ?? []) as ServiceItemRow[];
    }

    const fleetJobs = ((fleetResult.data ?? []) as FleetJobRaw[]).filter((job) =>
      assetType === "vehicle"
        ? clean(job.vehicle_asset_id) === assetId
        : clean(job.plant_asset_id || job.plant_id) === assetId,
    );

    const totalSpend = spend.reduce((sum, row) => sum + row.amountIncGst, 0);

    return NextResponse.json({
      asset,
      assetType,
      assetLabel: assetLabel(assetType, asset),
      documents: (documentResult.data ?? []) as AssetDocumentRow[],
      services,
      serviceItems,
      prestarts: prestartResult.error ? [] : prestartResult.data ?? [],
      fleetJobs,
      events: (eventResult.data ?? []) as AssetEventRow[],
      documentTypes: (documentTypeResult.data ?? []) as AssetDocumentTypeRow[],
      projectHistory: projects,
      spend,
      totalSpend,
      canManage: canManageAssets(identity.role),
      identity,
    });
  } catch (error) {
    const apiError = assetApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

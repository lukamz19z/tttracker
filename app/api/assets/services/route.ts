import { NextResponse } from "next/server";

import {
  assetApiError,
  canViewAssets,
  requireAssetUser,
} from "@/lib/assets/server";
import {
  assetLabel,
} from "@/lib/assets/sharepoint";
import type {
  AssetRecord,
  AssetServiceRecordRow,
} from "@/lib/assets/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { service, identity } = await requireAssetUser(request);

    if (!canViewAssets(identity.role)) {
      throw new Error("ASSET_VIEW_FORBIDDEN");
    }

    const url = new URL(request.url);
    const limit = Math.min(
      500,
      Math.max(
        1,
        Number(url.searchParams.get("limit") ?? 250) || 250,
      ),
    );

    const { data: recordsData, error: recordsError } =
      await service
        .from("asset_service_records")
        .select("*")
        .order("service_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit);

    if (recordsError) throw new Error(recordsError.message);

    const records =
      (recordsData ?? []) as AssetServiceRecordRow[];

    const vehicleIds = Array.from(
      new Set(
        records
          .map((record) => record.vehicle_asset_id)
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const plantIds = Array.from(
      new Set(
        records
          .map((record) => record.plant_asset_id)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const [vehicleResult, plantResult] = await Promise.all([
      vehicleIds.length > 0
        ? service
            .from("vehicle_assets")
            .select("*")
            .in("id", vehicleIds)
        : Promise.resolve({ data: [], error: null }),
      plantIds.length > 0
        ? service
            .from("plant_assets")
            .select("*")
            .in("id", plantIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (vehicleResult.error) {
      throw new Error(vehicleResult.error.message);
    }
    if (plantResult.error) {
      throw new Error(plantResult.error.message);
    }

    const vehicles = new Map(
      ((vehicleResult.data ?? []) as AssetRecord[]).map(
        (asset) => [asset.id, asset],
      ),
    );
    const plant = new Map(
      ((plantResult.data ?? []) as AssetRecord[]).map(
        (asset) => [asset.id, asset],
      ),
    );

    return NextResponse.json({
      records: records.map((record) => {
        const asset =
          record.asset_type === "vehicle"
            ? vehicles.get(record.vehicle_asset_id ?? "")
            : plant.get(record.plant_asset_id ?? "");

        return {
          ...record,
          asset_label: asset
            ? assetLabel(record.asset_type, asset)
            : "Unknown asset",
          asset_href:
            record.asset_type === "vehicle"
              ? `/assets/vehicles/${record.vehicle_asset_id}`
              : `/assets/plant/${record.plant_asset_id}`,
        };
      }),
    });
  } catch (error) {
    const apiError = assetApiError(error);

    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}

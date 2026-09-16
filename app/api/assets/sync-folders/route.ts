import { NextResponse } from "next/server";

import {
  assetApiError,
  canManageAssets,
  parseAssetType,
  requireAssetUser,
} from "@/lib/assets/server";
import {
  ensureAssetSharePointFolder,
} from "@/lib/assets/sharepoint";
import type { AssetType } from "@/lib/assets/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type SyncFailure = {
  assetType: AssetType;
  assetId: string;
  label: string;
  error: string;
};

export async function POST(request: Request) {
  try {
    const { service, identity } = await requireAssetUser(request);

    if (!canManageAssets(identity.role)) {
      throw new Error("ASSET_MANAGE_FORBIDDEN");
    }

    let body: {
      assetType?: string;
      assetId?: string;
    } = {};

    try {
      body = (await request.json()) as {
        assetType?: string;
        assetId?: string;
      };
    } catch {
      body = {};
    }

    const requestedType = body.assetType
      ? parseAssetType(body.assetType)
      : null;
    const requestedId = String(body.assetId ?? "").trim();

    if (body.assetType && !requestedType) {
      return NextResponse.json(
        { error: "Asset type must be vehicle or plant." },
        { status: 400 },
      );
    }

    if (requestedType && requestedId) {
      const result = await ensureAssetSharePointFolder({
        service,
        assetType: requestedType,
        assetId: requestedId,
      });

      return NextResponse.json({
        synced: 1,
        failed: 0,
        failures: [],
        asset: {
          assetType: requestedType,
          assetId: requestedId,
          folderName: result.assetFolder.name,
          webUrl: result.assetFolder.webUrl ?? null,
        },
      });
    }

    const [vehicleResult, plantResult] = await Promise.all([
      !requestedType || requestedType === "vehicle"
        ? service
            .from("vehicle_assets")
            .select("id,vehicle_id,vehicle_rego,make,model")
            .order("vehicle_id")
        : Promise.resolve({ data: [], error: null }),
      !requestedType || requestedType === "plant"
        ? service
            .from("plant_assets")
            .select("id,asset_id,rego,make,model")
            .order("asset_id")
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (vehicleResult.error) throw new Error(vehicleResult.error.message);
    if (plantResult.error) throw new Error(plantResult.error.message);

    const targets: Array<{
      assetType: AssetType;
      id: string;
      label: string;
    }> = [
      ...(vehicleResult.data ?? []).map((asset) => ({
        assetType: "vehicle" as const,
        id: asset.id,
        label:
          [
            asset.vehicle_id,
            [asset.make, asset.model].filter(Boolean).join(" "),
            asset.vehicle_rego,
          ]
            .filter(Boolean)
            .join(" - ") || asset.id,
      })),
      ...(plantResult.data ?? []).map((asset) => ({
        assetType: "plant" as const,
        id: asset.id,
        label:
          [
            asset.asset_id,
            [asset.make, asset.model].filter(Boolean).join(" "),
            asset.rego,
          ]
            .filter(Boolean)
            .join(" - ") || asset.id,
      })),
    ];

    let synced = 0;
    const failures: SyncFailure[] = [];

    for (const target of targets) {
      try {
        await ensureAssetSharePointFolder({
          service,
          assetType: target.assetType,
          assetId: target.id,
        });
        synced += 1;
      } catch (error) {
        failures.push({
          assetType: target.assetType,
          assetId: target.id,
          label: target.label,
          error:
            error instanceof Error
              ? error.message
              : "Unknown SharePoint sync error.",
        });
      }
    }

    return NextResponse.json({
      synced,
      failed: failures.length,
      total: targets.length,
      failures,
    });
  } catch (error) {
    const apiError = assetApiError(error);

    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}

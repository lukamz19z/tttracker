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
import {
  ensureEquipmentSharePointFolder,
  parseEquipmentType,
  type EquipmentType,
} from "@/lib/assets/equipment-sharepoint";
import type { AssetType } from "@/lib/assets/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type SyncFailure = {
  assetType: AssetType | "equipment";
  assetId: string;
  equipmentType?: EquipmentType;
  label: string;
  error: string;
};

type EquipmentTarget = {
  equipmentType: EquipmentType;
  id: string;
  label: string;
};

const FALL_ARREST_TYPES = new Set([
  "Harness",
  "Pole Strap",
  "Cobra",
  "Descender",
  "Lanyard",
  "Rope Grab",
  "Anchor Strap",
  "Rescue Kit",
  "Fall Protection Other",
  "Other",
]);

export async function POST(request: Request) {
  try {
    const { service, identity } = await requireAssetUser(request);

    if (!canManageAssets(identity.role)) {
      throw new Error("ASSET_MANAGE_FORBIDDEN");
    }

    let body: {
      assetType?: string;
      assetId?: string;
      equipmentType?: string;
      equipmentId?: string;
    } = {};

    try {
      body = (await request.json()) as typeof body;
    } catch {
      body = {};
    }

    const requestedType = body.assetType
      ? parseAssetType(body.assetType)
      : null;
    const requestedId = String(body.assetId ?? "").trim();
    const requestedEquipmentType = body.equipmentType
      ? parseEquipmentType(body.equipmentType)
      : null;
    const requestedEquipmentId = String(body.equipmentId ?? "").trim();

    if (body.assetType && !requestedType) {
      return NextResponse.json(
        { error: "Asset type must be vehicle or plant." },
        { status: 400 },
      );
    }

    if (body.equipmentType && !requestedEquipmentType) {
      return NextResponse.json(
        { error: "Unsupported equipment type." },
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
        total: 1,
        failures: [],
        asset: {
          assetType: requestedType,
          assetId: requestedId,
          folderName: result.assetFolder.name,
          webUrl: result.assetFolder.webUrl ?? null,
        },
      });
    }

    if (requestedEquipmentType && requestedEquipmentId) {
      const result = await ensureEquipmentSharePointFolder({
        service,
        equipmentType: requestedEquipmentType,
        equipmentId: requestedEquipmentId,
      });

      return NextResponse.json({
        synced: 1,
        failed: 0,
        total: 1,
        failures: [],
        equipment: {
          equipmentType: requestedEquipmentType,
          equipmentId: requestedEquipmentId,
          folderName: result.itemFolder.name,
          webUrl: result.itemFolder.webUrl ?? null,
        },
      });
    }

    const [
      vehicleResult,
      plantResult,
      liftingResult,
      generatorResult,
      ladderResult,
      torqueResult,
      kitResult,
    ] = await Promise.all([
      !requestedType
        ? service
            .from("vehicle_assets")
            .select("id,vehicle_id,vehicle_rego,make,model")
            .order("vehicle_id")
        : requestedType === "vehicle"
          ? service
              .from("vehicle_assets")
              .select("id,vehicle_id,vehicle_rego,make,model")
              .order("vehicle_id")
          : Promise.resolve({ data: [], error: null }),
      !requestedType
        ? service
            .from("plant_assets")
            .select("id,asset_id,rego,make,model")
            .order("asset_id")
        : requestedType === "plant"
          ? service
              .from("plant_assets")
              .select("id,asset_id,rego,make,model")
              .order("asset_id")
          : Promise.resolve({ data: [], error: null }),
      !requestedType && !requestedEquipmentType
        ? service.from("equipment_lifting_gear").select("id,serial_id,equipment_type")
        : Promise.resolve({ data: [], error: null }),
      !requestedType && !requestedEquipmentType
        ? service.from("equipment_generators").select("id,generator_number,make,model")
        : Promise.resolve({ data: [], error: null }),
      !requestedType && !requestedEquipmentType
        ? service.from("equipment_ladders").select("id,ladder_number,make,ladder_type")
        : Promise.resolve({ data: [], error: null }),
      !requestedType && !requestedEquipmentType
        ? service.from("equipment_torque_wrenches").select("id,torque_wrench_number,serial_number")
        : Promise.resolve({ data: [], error: null }),
      !requestedType && !requestedEquipmentType
        ? service.from("inventory_kits").select("id,kit_number,kit_type")
        : Promise.resolve({ data: [], error: null }),
    ]);

    for (const result of [
      vehicleResult,
      plantResult,
      liftingResult,
      generatorResult,
      ladderResult,
      torqueResult,
      kitResult,
    ]) {
      if (result.error) throw new Error(result.error.message);
    }

    const assetTargets: Array<{
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

    const equipmentTargets: EquipmentTarget[] = [
      ...(liftingResult.data ?? []).map((item) => ({
        equipmentType: FALL_ARREST_TYPES.has(String(item.equipment_type ?? "").trim())
          ? ("fall_arrest" as const)
          : ("lifting_gear" as const),
        id: item.id,
        label: [item.serial_id, item.equipment_type].filter(Boolean).join(" - ") || item.id,
      })),
      ...(generatorResult.data ?? []).map((item) => ({
        equipmentType: "generator" as const,
        id: item.id,
        label: [item.generator_number, item.make, item.model].filter(Boolean).join(" - ") || item.id,
      })),
      ...(ladderResult.data ?? []).map((item) => ({
        equipmentType: "ladder" as const,
        id: item.id,
        label: [item.ladder_number, item.make, item.ladder_type].filter(Boolean).join(" - ") || item.id,
      })),
      ...(torqueResult.data ?? []).map((item) => ({
        equipmentType: "torque_wrench" as const,
        id: item.id,
        label: [item.torque_wrench_number, item.serial_number].filter(Boolean).join(" - ") || item.id,
      })),
      ...(kitResult.data ?? []).map((item) => ({
        equipmentType: "inventory_kit" as const,
        id: item.id,
        label: [item.kit_number, item.kit_type].filter(Boolean).join(" - ") || item.id,
      })),
    ];

    let synced = 0;
    const failures: SyncFailure[] = [];

    for (const target of assetTargets) {
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

    for (const target of equipmentTargets) {
      try {
        await ensureEquipmentSharePointFolder({
          service,
          equipmentType: target.equipmentType,
          equipmentId: target.id,
        });
        synced += 1;
      } catch (error) {
        failures.push({
          assetType: "equipment",
          assetId: target.id,
          equipmentType: target.equipmentType,
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
      total: assetTargets.length + equipmentTargets.length,
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

import { NextResponse } from "next/server";

import {
  assetApiError,
  assetDetailRoute,
  assetTable,
  canManageAssets,
  clean,
  parseAssetType,
  requireAssetUser,
} from "@/lib/assets/server";
import { assetLabel, ensureAssetSharePointFolder } from "@/lib/assets/sharepoint";
import type { AssetRecord, AssetType } from "@/lib/assets/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type CreatePayload = {
  asset?: Record<string, unknown>;
  projectOnboardDate?: string | null;
};

const VEHICLE_FIELDS = new Set([
  "vehicle_id",
  "vehicle_rego",
  "make",
  "model",
  "category",
  "crew",
  "project",
  "company_onboard_date",
  "status",
  "year",
  "style",
  "owner",
  "vin_number",
  "last_service",
  "service_interval_km",
  "next_service_due",
  "next_service_km",
  "next_inspection_due",
  "current_odometer_km",
  "rego_expiry",
  "insurance_expiry",
  "risk_assessment_date",
  "hired",
  "hired_from",
  "hire_term",
  "off_hire_date",
  "superseded_by",
  "inactive_reason",
  "spare_key_provided",
  "spare_key_location",
  "ehub",
  "dashcam",
  "alert_button",
  "fuel_card",
  "reverse_squawker",
  "uhf_radio",
  "fire_extinguisher",
  "first_aid_kit",
  "snake_bite_kit",
  "wheel_nut_indicators",
  "wheel_chocks",
  "shovel",
  "knapsack",
  "notes",
]);

const PLANT_FIELDS = new Set([
  "asset_id",
  "make",
  "model",
  "plant_type",
  "serial_number",
  "rego",
  "crew",
  "project",
  "insurance_expiry",
  "rego_expiry",
  "cranesafe_expiry",
  "ten_year_inspection_due",
  "risk_assessment_date",
  "last_service_date",
  "last_service_hours",
  "service_interval_hours",
  "next_service_due",
  "next_service_hours",
  "next_inspection_due",
  "current_engine_hours",
  "hired",
  "hired_from",
  "hire_term",
  "asset_status",
  "off_hire_date",
  "superseded_by",
  "inactive_reason",
  "risk_assessment",
  "operators_manual",
  "load_charts",
  "logbook",
  "fire_extinguisher",
  "first_aid_kit",
  "spill_kit",
  "notes",
]);

function allowedFields(assetType: AssetType) {
  return assetType === "vehicle" ? VEHICLE_FIELDS : PLANT_FIELDS;
}

function sanitiseAssetPayload(assetType: AssetType, raw: Record<string, unknown>) {
  const allowed = allowedFields(assetType);
  const payload: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (allowed.has(key)) payload[key] = value;
  }

  return payload;
}

async function createInitialProjectHistory({
  service,
  assetType,
  assetId,
  asset,
  projectOnboardDate,
}: {
  service: Awaited<ReturnType<typeof requireAssetUser>>["service"];
  assetType: AssetType;
  assetId: string;
  asset: AssetRecord;
  projectOnboardDate: string | null;
}) {
  if (!clean(asset.project) && !clean(asset.crew)) return;

  const table =
    assetType === "vehicle" ? "vehicle_project_history" : "plant_project_history";
  const idColumn = assetType === "vehicle" ? "vehicle_asset_id" : "plant_asset_id";

  const { error } = await service.from(table).insert({
    [idColumn]: assetId,
    project: clean(asset.project) || null,
    crew: clean(asset.crew) || null,
    project_onboard_date:
      clean(projectOnboardDate) || new Date().toISOString().slice(0, 10),
    project_offboard_date: null,
    notes: "Initial asset onboarding",
  });

  if (error) {
    console.warn("Initial asset project history could not be created", error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ assetType: string }> }) {
  try {
    const { assetType: rawType } = await context.params;
    const assetType = parseAssetType(rawType);

    if (!assetType) {
      return NextResponse.json(
        { error: "Asset type must be vehicle or plant." },
        { status: 400 },
      );
    }

    const { service, identity } = await requireAssetUser(request);
    if (!canManageAssets(identity.role)) throw new Error("ASSET_MANAGE_FORBIDDEN");

    const body = (await request.json()) as CreatePayload;
    const rawAsset = body.asset ?? {};
    const payload = sanitiseAssetPayload(assetType, rawAsset);

    const code =
      assetType === "vehicle" ? clean(payload.vehicle_id) : clean(payload.asset_id);

    if (!code) {
      return NextResponse.json(
        { error: assetType === "vehicle" ? "Vehicle ID is required." : "Asset ID is required." },
        { status: 400 },
      );
    }

    if (assetType === "vehicle" && !clean(payload.vehicle_rego)) {
      return NextResponse.json({ error: "Vehicle registration is required." }, { status: 400 });
    }

    if (assetType === "plant" && !clean(payload.plant_type)) {
      return NextResponse.json({ error: "Plant type is required." }, { status: 400 });
    }

    const { data, error } = await service
      .from(assetTable(assetType))
      .insert({ ...payload, updated_at: new Date().toISOString() })
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    const asset = data as AssetRecord;

    await createInitialProjectHistory({
      service,
      assetType,
      assetId: asset.id,
      asset,
      projectOnboardDate: clean(body.projectOnboardDate) || null,
    });

    let sharePointWarning: string | null = null;
    let resolvedAsset = asset;

    try {
      const sharePoint = await ensureAssetSharePointFolder({
        service,
        assetType,
        assetId: asset.id,
      });
      resolvedAsset = sharePoint.asset;
    } catch (sharePointError) {
      sharePointWarning =
        sharePointError instanceof Error
          ? `Asset created, but SharePoint folder setup failed: ${sharePointError.message}`
          : "Asset created, but SharePoint folder setup failed.";
    }

    const { error: eventError } = await service.from("asset_events").insert({
      asset_type: assetType,
      vehicle_asset_id: assetType === "vehicle" ? asset.id : null,
      plant_asset_id: assetType === "plant" ? asset.id : null,
      event_type: "other",
      event_date: new Date().toISOString().slice(0, 10),
      title: "Asset created",
      description: `${assetLabel(assetType, asset)} added to the Asset register.`,
      performed_by: identity.userId,
      performed_by_name: identity.name,
      metadata: {
        source: "asset_master_create",
        sharepoint_folder_created: !sharePointWarning,
        action_route: assetDetailRoute(assetType, asset.id),
      },
    });

    if (eventError) {
      console.warn("Asset creation timeline event could not be created", eventError);
    }

    return NextResponse.json(
      {
        asset: resolvedAsset,
        sharePointWarning,
        href: assetDetailRoute(assetType, asset.id),
      },
      { status: 201 },
    );
  } catch (error) {
    const apiError = assetApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

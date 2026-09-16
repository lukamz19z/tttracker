import { NextResponse } from "next/server";

import {
  assetApiError,
  assetTable,
  canManageAssets,
  clean,
  parseAssetType,
  requireAssetUser,
} from "@/lib/assets/server";
import { ensureAssetSharePointFolder } from "@/lib/assets/sharepoint";
import type { AssetType } from "@/lib/assets/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const VEHICLE_FIELDS = new Set([
  "vehicle_id", "vehicle_rego", "make", "model", "category", "crew", "project",
  "company_onboard_date", "status", "year", "style", "owner", "vin_number",
  "last_service", "service_interval_km", "next_service_due", "next_service_km",
  "next_inspection_due", "current_odometer_km", "rego_expiry", "insurance_expiry",
  "risk_assessment_date", "hired", "hired_from", "hire_term", "off_hire_date",
  "superseded_by", "inactive_reason", "spare_key_provided", "spare_key_location",
  "ehub", "dashcam", "alert_button", "fuel_card", "reverse_squawker", "uhf_radio",
  "fire_extinguisher", "first_aid_kit", "snake_bite_kit", "wheel_nut_indicators",
  "wheel_chocks", "shovel", "knapsack", "notes",
]);

const PLANT_FIELDS = new Set([
  "asset_id", "make", "model", "plant_type", "serial_number", "rego", "crew", "project",
  "insurance_expiry", "rego_expiry", "cranesafe_expiry", "ten_year_inspection_due",
  "risk_assessment_date", "last_service_date", "last_service_hours", "service_interval_hours",
  "next_service_due", "next_service_hours", "next_inspection_due", "current_engine_hours",
  "hired", "hired_from", "hire_term", "asset_status", "off_hire_date", "superseded_by",
  "inactive_reason", "risk_assessment", "operators_manual", "load_charts", "logbook",
  "fire_extinguisher", "first_aid_kit", "spill_kit", "notes",
]);

function sanitise(assetType: AssetType, raw: Record<string, unknown>) {
  const allowed = assetType === "vehicle" ? VEHICLE_FIELDS : PLANT_FIELDS;
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (allowed.has(key)) payload[key] = value;
  }
  return payload;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ assetType: string; assetId: string }> },
) {
  try {
    const { assetType: rawType, assetId } = await context.params;
    const assetType = parseAssetType(rawType);
    if (!assetType) {
      return NextResponse.json({ error: "Asset type must be vehicle or plant." }, { status: 400 });
    }

    const { service, identity } = await requireAssetUser(request);
    if (!canManageAssets(identity.role)) throw new Error("ASSET_MANAGE_FORBIDDEN");

    const body = (await request.json()) as { asset?: Record<string, unknown> };
    const payload = sanitise(assetType, body.asset ?? {});

    const { data, error } = await service
      .from(assetTable(assetType))
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", assetId)
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    let sharePointWarning: string | null = null;
    let resolvedAsset = data;

    try {
      const resolved = await ensureAssetSharePointFolder({ service, assetType, assetId });
      resolvedAsset = resolved.asset;
    } catch (sharePointError) {
      sharePointWarning =
        sharePointError instanceof Error
          ? `Asset updated, but the SharePoint folder could not be synchronised: ${sharePointError.message}`
          : "Asset updated, but the SharePoint folder could not be synchronised.";
    }

    const { error: eventError } = await service.from("asset_events").insert({
      asset_type: assetType,
      vehicle_asset_id: assetType === "vehicle" ? assetId : null,
      plant_asset_id: assetType === "plant" ? assetId : null,
      event_type: "other",
      event_date: new Date().toISOString().slice(0, 10),
      title: "Asset master details updated",
      description: sharePointWarning || "Master Asset details updated and SharePoint folder synchronised.",
      performed_by: identity.userId,
      performed_by_name: identity.name,
      metadata: { source: "asset_master_edit", sharepoint_synced: !sharePointWarning },
    });

    if (eventError) console.warn("Asset edit timeline warning", eventError);

    return NextResponse.json({ asset: resolvedAsset, sharePointWarning });
  } catch (error) {
    const apiError = assetApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

import { NextRequest, NextResponse } from "next/server";

import {
  mobileApiError,
  requireMobilePermission,
} from "@/lib/mobile/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normaliseSegment(value: unknown) {
  const raw = clean(value);
  return raw || "General";
}

export async function POST(request: NextRequest) {
  try {
    const { service, identity } = await requireMobilePermission(
      request,
      "mobile.materials",
    );

    const body = (await request.json()) as {
      sourceBundleId?: unknown;
      destinationTowerId?: unknown;
      destinationBundleId?: unknown;
      quantity?: unknown;
      notes?: unknown;
    };

    const sourceBundleId = clean(body.sourceBundleId);
    const destinationTowerId = clean(body.destinationTowerId);
    const destinationBundleId = clean(body.destinationBundleId);
    const quantity = Math.max(Math.floor(numberValue(body.quantity)), 0);

    if (!sourceBundleId || !destinationTowerId || !destinationBundleId) {
      return NextResponse.json(
        { error: "Source bundle, destination tower and destination bundle are required." },
        { status: 400 },
      );
    }

    if (quantity <= 0) {
      return NextResponse.json(
        { error: "Transfer quantity must be greater than zero." },
        { status: 400 },
      );
    }

    const [{ data: sourceBundle, error: sourceError }, { data: destinationBundle, error: destinationError }] =
      await Promise.all([
        service
          .from("tower_required_bundles")
          .select("id,tower_id,bundle_no,section,qty_required")
          .eq("id", sourceBundleId)
          .maybeSingle(),
        service
          .from("tower_required_bundles")
          .select("id,tower_id,bundle_no,section,qty_required")
          .eq("id", destinationBundleId)
          .maybeSingle(),
      ]);

    if (sourceError) throw new Error(sourceError.message);
    if (destinationError) throw new Error(destinationError.message);
    if (!sourceBundle || !destinationBundle) {
      return NextResponse.json({ error: "Bundle not found." }, { status: 404 });
    }

    if (destinationBundle.tower_id !== destinationTowerId) {
      return NextResponse.json(
        { error: "The selected destination bundle does not belong to the destination tower." },
        { status: 400 },
      );
    }

    if (sourceBundle.tower_id === destinationTowerId) {
      return NextResponse.json(
        { error: "Select a different destination tower." },
        { status: 400 },
      );
    }

    const { data: sourceTower, error: sourceTowerError } = await service
      .from("towers")
      .select("id,project_id")
      .eq("id", sourceBundle.tower_id)
      .maybeSingle();

    if (sourceTowerError) throw new Error(sourceTowerError.message);
    if (!sourceTower) {
      return NextResponse.json({ error: "Source tower not found." }, { status: 404 });
    }

    const { data: access, error: accessError } = await service
      .from("project_access")
      .select("project_id")
      .eq("project_id", sourceTower.project_id)
      .eq("user_id", identity.userId)
      .maybeSingle();

    if (accessError) throw new Error(accessError.message);
    if (!access) {
      return NextResponse.json(
        { error: "You do not have access to this project." },
        { status: 403 },
      );
    }

    const { data: destinationTower, error: destinationTowerError } = await service
      .from("towers")
      .select("id,project_id")
      .eq("id", destinationTowerId)
      .maybeSingle();

    if (destinationTowerError) throw new Error(destinationTowerError.message);
    if (!destinationTower || destinationTower.project_id !== sourceTower.project_id) {
      return NextResponse.json(
        { error: "Destination tower must belong to the same project." },
        { status: 400 },
      );
    }

    const { data: check, error: checkError } = await service
      .from("tower_material_bundle_checks")
      .select("qty_received")
      .eq("bundle_id", sourceBundleId)
      .maybeSingle();

    if (checkError) throw new Error(checkError.message);

    const { data: activeTransfers, error: transfersError } = await service
      .from("tower_material_transfers")
      .select("quantity,status")
      .eq("source_bundle_id", sourceBundleId)
      .in("status", ["in_transit", "received"]);

    if (transfersError) throw new Error(transfersError.message);

    const received = Math.max(numberValue(check?.qty_received), 0);
    const alreadyTransferred = (activeTransfers ?? []).reduce(
      (sum, row) => sum + Math.max(numberValue(row.quantity), 0),
      0,
    );
    const currentQty = Math.max(received - alreadyTransferred, 0);

    if (quantity > currentQty) {
      return NextResponse.json(
        { error: `Only ${currentQty} bundle(s) are currently confirmed at the source tower.` },
        { status: 400 },
      );
    }

    const { data: transfer, error } = await service
      .from("tower_material_transfers")
      .insert({
        project_id: sourceTower.project_id,
        source_tower_id: sourceBundle.tower_id,
        destination_tower_id: destinationTowerId,
        source_bundle_id: sourceBundleId,
        destination_bundle_id: destinationBundleId,
        bundle_no: clean(sourceBundle.bundle_no),
        bundle_section: normaliseSegment(sourceBundle.section),
        quantity,
        status: "in_transit",
        transferred_by: identity.userId,
        transferred_by_name: clean(identity.fullName) || clean(identity.email) || "TTTracker Mobile",
        transferred_at: new Date().toISOString(),
        notes: clean(body.notes) || null,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ transfer });
  } catch (error) {
    const apiError = mobileApiError(error);
    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}

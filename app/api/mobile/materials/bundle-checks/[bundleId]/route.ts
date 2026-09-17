import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  mobileApiError,
  requireMobilePermission,
} from "@/lib/mobile/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BundleStatus =
  | "not_checked"
  | "arrived"
  | "partial"
  | "missing"
  | "issue";

type RouteContext = {
  params: Promise<{ bundleId: string }>;
};

const VALID_STATUSES = new Set<BundleStatus>([
  "not_checked",
  "arrived",
  "partial",
  "missing",
  "issue",
]);

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function loadBundleContext(
  service: SupabaseClient,
  userId: string,
  bundleId: string,
) {
  const { data: bundle, error: bundleError } = await service
    .from("tower_required_bundles")
    .select("id,tower_id,bundle_no,qty_required")
    .eq("id", bundleId)
    .maybeSingle();

  if (bundleError) throw new Error(bundleError.message);
  if (!bundle) throw new Error("Bundle not found.");

  const { data: tower, error: towerError } = await service
    .from("towers")
    .select("id,project_id")
    .eq("id", bundle.tower_id)
    .maybeSingle();

  if (towerError) throw new Error(towerError.message);
  if (!tower) throw new Error("Tower not found.");

  const { data: access, error: accessError } = await service
    .from("project_access")
    .select("project_id")
    .eq("project_id", tower.project_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (accessError) throw new Error(accessError.message);
  if (!access) throw new Error("You do not have access to this project.");

  return { bundle, tower };
}

export async function PUT(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    const { service, identity } = await requireMobilePermission(
      request,
      "mobile.materials",
    );

    const { bundleId } = await context.params;
    const cleanBundleId = clean(bundleId);

    if (!cleanBundleId) {
      return NextResponse.json(
        { error: "Bundle ID is required." },
        { status: 400 },
      );
    }

    const { bundle } = await loadBundleContext(
      service,
      identity.userId,
      cleanBundleId,
    );

    const body = (await request.json().catch(() => ({}))) as {
      qtyReceived?: unknown;
      status?: unknown;
      notes?: unknown;
    };

    const required = Math.max(Math.round(numberValue(bundle.qty_required)), 1);
    const requestedQty = Math.max(Math.round(numberValue(body.qtyReceived)), 0);
    const qtyReceived = Math.min(requestedQty, required);

    const requestedStatus = clean(body.status) as BundleStatus;
    const forcedStatus = VALID_STATUSES.has(requestedStatus)
      ? requestedStatus
      : null;

    const { data: existing, error: existingError } = await service
      .from("tower_material_bundle_checks")
      .select("notes")
      .eq("bundle_id", cleanBundleId)
      .maybeSingle();

    if (existingError) throw new Error(existingError.message);

    const status: BundleStatus =
      forcedStatus ??
      (qtyReceived <= 0
        ? "not_checked"
        : qtyReceived < required
          ? "partial"
          : "arrived");

    const payload = {
      tower_id: bundle.tower_id,
      bundle_id: cleanBundleId,
      bundle_no: clean(bundle.bundle_no),
      status,
      notes:
        body.notes !== undefined
          ? clean(body.notes)
          : clean(existing?.notes),
      checked_by: clean(identity.fullName) || "TTTracker Mobile",
      checked_at: new Date().toISOString(),
      qty_received: qtyReceived,
    };

    const { data: check, error } = await service
      .from("tower_material_bundle_checks")
      .upsert(payload, { onConflict: "bundle_id" })
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ check });
  } catch (error) {
    const apiError = mobileApiError(error);
    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    const { service, identity } = await requireMobilePermission(
      request,
      "mobile.materials",
    );

    const { bundleId } = await context.params;
    const cleanBundleId = clean(bundleId);

    if (!cleanBundleId) {
      return NextResponse.json(
        { error: "Bundle ID is required." },
        { status: 400 },
      );
    }

    await loadBundleContext(service, identity.userId, cleanBundleId);

    const [bundleResult, memberResult] = await Promise.all([
      service
        .from("tower_material_bundle_checks")
        .delete()
        .eq("bundle_id", cleanBundleId),
      service
        .from("tower_material_member_checks")
        .delete()
        .eq("bundle_id", cleanBundleId),
    ]);

    if (bundleResult.error) throw new Error(bundleResult.error.message);
    if (memberResult.error) throw new Error(memberResult.error.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const apiError = mobileApiError(error);
    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";

import {
  mobileApiError,
  requireMobilePermission,
} from "@/lib/mobile/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ transferId: string }>;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    const { service, identity } = await requireMobilePermission(
      request,
      "mobile.materials",
    );

    const { transferId } = await context.params;

    const { data: transfer, error: transferLoadError } = await service
      .from("tower_material_transfers")
      .select("*")
      .eq("id", transferId)
      .maybeSingle();

    if (transferLoadError) throw new Error(transferLoadError.message);
    if (!transfer) {
      return NextResponse.json({ error: "Transfer not found." }, { status: 404 });
    }

    if (transfer.status !== "in_transit") {
      return NextResponse.json(
        { error: "Only an in-transit transfer can be received." },
        { status: 409 },
      );
    }

    const { data: access, error: accessError } = await service
      .from("project_access")
      .select("project_id")
      .eq("project_id", transfer.project_id)
      .eq("user_id", identity.userId)
      .maybeSingle();

    if (accessError) throw new Error(accessError.message);
    if (!access) {
      return NextResponse.json(
        { error: "You do not have access to this project." },
        { status: 403 },
      );
    }

    const { data: destinationBundle, error: destinationError } = await service
      .from("tower_required_bundles")
      .select("id,tower_id,bundle_no,qty_required")
      .eq("id", transfer.destination_bundle_id)
      .maybeSingle();

    if (destinationError) throw new Error(destinationError.message);
    if (!destinationBundle || destinationBundle.tower_id !== transfer.destination_tower_id) {
      return NextResponse.json(
        { error: "Destination bundle could not be resolved." },
        { status: 400 },
      );
    }

    const receivedAt = new Date().toISOString();
    const actorName =
      clean(identity.fullName) || clean(identity.email) || "TTTracker Mobile";

    const { data: claimed, error: claimError } = await service
      .from("tower_material_transfers")
      .update({
        status: "received",
        received_by: identity.userId,
        received_by_name: actorName,
        received_at: receivedAt,
      })
      .eq("id", transferId)
      .eq("status", "in_transit")
      .select("id")
      .maybeSingle();

    if (claimError) throw new Error(claimError.message);
    if (!claimed) {
      return NextResponse.json(
        { error: "This transfer has already been received, cancelled or changed." },
        { status: 409 },
      );
    }

    const { data: existing, error: existingError } = await service
      .from("tower_material_bundle_checks")
      .select("qty_received,notes")
      .eq("bundle_id", destinationBundle.id)
      .maybeSingle();

    if (existingError) throw new Error(existingError.message);

    const nextQty =
      Math.max(numberValue(existing?.qty_received), 0) +
      Math.max(numberValue(transfer.quantity), 0);

    const required = Math.max(numberValue(destinationBundle.qty_required), 1);
    const status =
      nextQty >= required ? "arrived" : nextQty > 0 ? "partial" : "not_checked";

    const { error: checkError } = await service
      .from("tower_material_bundle_checks")
      .upsert(
        {
          tower_id: destinationBundle.tower_id,
          bundle_id: destinationBundle.id,
          bundle_no: clean(destinationBundle.bundle_no),
          status,
          notes: clean(existing?.notes),
          checked_by: actorName,
          checked_at: receivedAt,
          qty_received: nextQty,
        },
        { onConflict: "bundle_id" },
      );

    if (checkError) {
      await service
        .from("tower_material_transfers")
        .update({
          status: "in_transit",
          received_by: null,
          received_by_name: null,
          received_at: null,
        })
        .eq("id", transferId)
        .eq("status", "received");

      throw new Error(checkError.message);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const apiError = mobileApiError(error);
    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}

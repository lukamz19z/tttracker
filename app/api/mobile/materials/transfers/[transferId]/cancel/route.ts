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
      .select("id,project_id,status")
      .eq("id", transferId)
      .maybeSingle();

    if (transferLoadError) throw new Error(transferLoadError.message);
    if (!transfer) {
      return NextResponse.json({ error: "Transfer not found." }, { status: 404 });
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

    const { data: cancelled, error } = await service
      .from("tower_material_transfers")
      .update({
        status: "cancelled",
        cancelled_by: identity.userId,
        cancelled_by_name:
          clean(identity.fullName) || clean(identity.email) || "TTTracker Mobile",
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", transferId)
      .eq("status", "in_transit")
      .select("id")
      .maybeSingle();

    if (error) throw new Error(error.message);

    if (!cancelled) {
      return NextResponse.json(
        { error: "This transfer has already been received, cancelled or changed." },
        { status: 409 },
      );
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

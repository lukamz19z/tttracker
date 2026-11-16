import { NextRequest, NextResponse } from "next/server";

import { createServiceClient, getRequestUser } from "@/lib/access/server";
import { mobileApiError } from "@/lib/mobile/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request);
    const service = createServiceClient();
    const { data, error } = await service.rpc("mobile_approval_counts", { p_user_id: user.id });
    if (error) throw new Error(`Mobile approval counts failed: ${error.message}`);
    return NextResponse.json(data ?? { dailyDockets: 0, expenseClaims: 0, invoices: 0 }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const apiError = mobileApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

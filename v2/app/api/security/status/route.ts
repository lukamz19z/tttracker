import { securityError } from "@/lib/security/errors";
import { NextResponse } from "next/server";

import { getSecurityStatus } from "@/lib/security/status";

export async function GET() {
  try {
    const status = await getSecurityStatus();
    return NextResponse.json(status, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const result = securityError(error);
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.status, headers: { "Cache-Control": "no-store" } },
    );
  }
}

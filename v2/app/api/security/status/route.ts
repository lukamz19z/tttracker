import { NextResponse } from "next/server";

import { getSecurityStatus } from "@/lib/security/status";

export async function GET() {
  try {
    const status = await getSecurityStatus();
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not resolve security status.",
      },
      { status: 401 },
    );
  }
}

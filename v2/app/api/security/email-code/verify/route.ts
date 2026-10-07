import { securityError } from "@/lib/security/errors";
import { NextRequest, NextResponse } from "next/server";

import { verifyEmailSecurityCode } from "@/lib/security/email-code";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const challengeId = String(body.challengeId ?? "").trim();

    const code = String(body.code ?? "").trim();

    if (!challengeId || !/^\d{6}$/.test(code)) {
      return NextResponse.json(
        { error: "Enter the 6-digit verification code." },
        { status: 400 },
      );
    }

    const result = await verifyEmailSecurityCode(challengeId, code);

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    const result = securityError(error);
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.status, headers: { "Cache-Control": "no-store" } },
    );
  }
}

import { securityError } from "@/lib/security/errors";
import { NextResponse } from "next/server";

import { sendEmailSecurityCode } from "@/lib/security/email-code";

export async function POST() {
  try {
    const result = await sendEmailSecurityCode();

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

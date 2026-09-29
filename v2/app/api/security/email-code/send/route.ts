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
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not send verification code.",
      },
      { status: 400 },
    );
  }
}

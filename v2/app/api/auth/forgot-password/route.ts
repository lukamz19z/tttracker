import { NextRequest, NextResponse } from "next/server";

import { requestPasswordRecovery } from "@/lib/auth/password-recovery";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();

    if (email) {
      await requestPasswordRecovery(email);
    }

    return NextResponse.json({
      ok: true,
      message:
        "If an account exists for that email, instructions have been sent.",
    });
  } catch {
    // Keep the response deliberately generic.
    return NextResponse.json({
      ok: true,
      message:
        "If an account exists for that email, instructions have been sent.",
    });
  }
}

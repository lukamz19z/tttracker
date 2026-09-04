import { NextResponse } from "next/server";

import {
  docketEmailShell,
  sendDailyDocketEmail,
} from "@/lib/email/daily-dockets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const recipient = process.env.TEST_EMAIL_TO;

    if (!recipient) {
      return NextResponse.json(
        { error: "Missing TEST_EMAIL_TO environment variable." },
        { status: 500 },
      );
    }

    const result = await sendDailyDocketEmail({
      to: [recipient],
      subject: "TTTracker email test",
      html: docketEmailShell(
        "TTTracker email test",
        `
          <p>This is a successful test email from TTTracker.</p>
          <p>If you received this, Resend is configured correctly.</p>
        `,
      ),
    });

    return NextResponse.json({
      success: true,
      emailId: result.id,
    });
  } catch (error) {
    console.error("TEST EMAIL ERROR", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Test email failed.",
      },
      { status: 500 },
    );
  }
}
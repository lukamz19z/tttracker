import { NextRequest, NextResponse } from "next/server";

import { sendEmailChangeConfirmations } from "@/lib/auth/email-change";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const sessionClient = await createSupabaseServer();

  const { data: claimsData, error: claimsError } =
    await sessionClient.auth.getClaims();

  const userId =
    typeof claimsData?.claims?.sub === "string"
      ? claimsData.claims.sub
      : null;

  if (claimsError || !userId) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED" },
      { status: 401 },
    );
  }

  const body = await request.json();
  const requestId = String(body.requestId ?? "").trim();

  if (!requestId) {
    return NextResponse.json(
      { error: "Request ID is required." },
      { status: 400 },
    );
  }

  const admin = createSupabaseAdmin();

  const { data: emailRequest, error: requestError } =
    await admin
      .from("v2_auth_email_requests")
      .select(`
        id,
        user_id,
        action_type,
        current_email,
        new_email,
        status
      `)
      .eq("id", requestId)
      .eq("user_id", userId)
      .eq("action_type", "email_change")
      .maybeSingle();

  if (requestError || !emailRequest) {
    return NextResponse.json(
      { error: requestError?.message ?? "Request not found." },
      { status: 404 },
    );
  }

  if (emailRequest.status !== "pending") {
    return NextResponse.json(
      { error: "This email change is no longer pending." },
      { status: 400 },
    );
  }

  if (!emailRequest.current_email || !emailRequest.new_email) {
    return NextResponse.json(
      { error: "Email change request is incomplete." },
      { status: 400 },
    );
  }

  try {
    await sendEmailChangeConfirmations({
      requestId: emailRequest.id,
      userId,
      currentEmail: emailRequest.current_email,
      newEmail: emailRequest.new_email,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not resend confirmations.",
      },
      { status: 400 },
    );
  }
}

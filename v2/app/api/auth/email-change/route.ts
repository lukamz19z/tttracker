import { NextRequest, NextResponse } from "next/server";

import {
  sendEmailChangeConfirmations,
  verifyCurrentPassword,
} from "@/lib/auth/email-change";
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

  const currentEmail =
    typeof claimsData?.claims?.email === "string"
      ? claimsData.claims.email.trim().toLowerCase()
      : null;

  if (claimsError || !userId || !currentEmail) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED" },
      { status: 401 },
    );
  }

  const body = await request.json();

  const newEmail = String(body.newEmail ?? "")
    .trim()
    .toLowerCase();

  const password = String(body.password ?? "");

  if (!newEmail || !password) {
    return NextResponse.json(
      { error: "New email and current password are required." },
      { status: 400 },
    );
  }

  if (newEmail === currentEmail) {
    return NextResponse.json(
      { error: "Enter a different email address." },
      { status: 400 },
    );
  }

  const passwordValid = await verifyCurrentPassword(
    currentEmail,
    password,
  );

  if (!passwordValid) {
    return NextResponse.json(
      { error: "Current password is incorrect." },
      { status: 403 },
    );
  }

  const admin = createSupabaseAdmin();

  await admin
    .from("v2_auth_email_requests")
    .update({
      status: "cancelled",
    })
    .eq("user_id", userId)
    .eq("action_type", "email_change")
    .eq("status", "pending");

  const { data: emailRequest, error: requestError } =
    await admin
      .from("v2_auth_email_requests")
      .insert({
        user_id: userId,
        action_type: "email_change",
        current_email: currentEmail,
        new_email: newEmail,
        status: "pending",
      })
      .select("id")
      .single();

  if (requestError || !emailRequest) {
    return NextResponse.json(
      {
        error:
          requestError?.message ??
          "Could not create email change request.",
      },
      { status: 500 },
    );
  }

  try {
    await sendEmailChangeConfirmations({
      requestId: emailRequest.id,
      userId,
      currentEmail,
      newEmail,
    });

    return NextResponse.json({
      ok: true,
      requestId: emailRequest.id,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not send email confirmations.";

    await admin
      .from("v2_auth_email_requests")
      .update({
        last_error: message,
      })
      .eq("id", emailRequest.id);

    return NextResponse.json(
      {
        error: message,
        requestId: emailRequest.id,
        recoverable: true,
      },
      { status: 400 },
    );
  }
}

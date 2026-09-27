import { NextResponse } from "next/server";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function GET() {
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

  if (claimsError || !userId) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED" },
      { status: 401 },
    );
  }

  const admin = createSupabaseAdmin();

  const { data: requests, error } = await admin
    .from("v2_auth_email_requests")
    .select(`
      id,
      current_email,
      new_email,
      status,
      send_count,
      last_sent_at,
      last_error,
      created_at
    `)
    .eq("user_id", userId)
    .eq("action_type", "email_change")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 },
    );
  }

  for (const item of requests ?? []) {
    if (
      item.status === "pending" &&
      currentEmail &&
      item.new_email?.toLowerCase() === currentEmail
    ) {
      await admin
        .from("v2_auth_email_requests")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", item.id);

      item.status = "completed";
    }
  }

  return NextResponse.json({
    requests: requests ?? [],
  });
}

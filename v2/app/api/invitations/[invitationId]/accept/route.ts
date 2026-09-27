import { NextRequest, NextResponse } from "next/server";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServer } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{
    invitationId: string;
  }>;
};

export async function POST(
  _request: NextRequest,
  context: RouteContext,
) {
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

  const { invitationId } = await context.params;
  const admin = createSupabaseAdmin();

  const { data: invitation, error: invitationError } = await admin
    .from("v2_organisation_invitations")
    .select(`
      id,
      organisation_id,
      status,
      auth_user_id,
      intended_role_code
    `)
    .eq("id", invitationId)
    .maybeSingle();

  if (invitationError || !invitation) {
    return NextResponse.json(
      { error: invitationError?.message ?? "Invitation not found." },
      { status: 404 },
    );
  }

  if (invitation.status === "accepted") {
    return NextResponse.json({ ok: true });
  }

  if (invitation.status !== "pending") {
    return NextResponse.json(
      { error: "This invitation is no longer active." },
      { status: 400 },
    );
  }

  if (invitation.auth_user_id && invitation.auth_user_id !== userId) {
    return NextResponse.json(
      { error: "This invitation belongs to a different user." },
      { status: 403 },
    );
  }

  const now = new Date().toISOString();

  const { error: membershipError } = await admin
    .from("organisation_users")
    .update({
      status: "active",
      joined_at: now,
    })
    .eq("organisation_id", invitation.organisation_id)
    .eq("user_id", userId);

  if (membershipError) {
    return NextResponse.json(
      { error: membershipError.message },
      { status: 500 },
    );
  }

  const { error: invitationUpdateError } = await admin
    .from("v2_organisation_invitations")
    .update({
      status: "accepted",
      accepted_user_id: userId,
      auth_user_id: userId,
    })
    .eq("id", invitation.id);

  if (invitationUpdateError) {
    return NextResponse.json(
      { error: invitationUpdateError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

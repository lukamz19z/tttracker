import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ invitationId: string }> },
) {
  const session = await createSupabaseServer();
  const { data: claims, error: authError } = await session.auth.getClaims();
  if (authError || typeof claims?.claims?.sub !== "string")
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { invitationId } = await context.params;
  const { data, error } = await session.rpc(
    "tttracker_v2_accept_organisation_invitation",
    { p_invitation_id: invitationId },
  );
  if (error)
    return NextResponse.json(
      { error: error.message },
      { status: error.message.includes("ACCESS_DENIED") ? 403 : 400 },
    );
  return NextResponse.json({ ok: true, ...data });
}

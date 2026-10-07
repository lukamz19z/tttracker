import { NextRequest, NextResponse } from "next/server";
import {
  platformErrorResponse,
  requirePlatformAdmin,
} from "@/lib/platform/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
type RouteContext = { params: Promise<{ invitationId: string }> };
async function manage(
  request: NextRequest,
  context: RouteContext,
  action: "change_email" | "revoke",
) {
  try {
    const actor = await requirePlatformAdmin(["owner", "admin"]);
    const { invitationId } = await context.params;
    const email =
      action === "change_email"
        ? String((await request.json()).email ?? "")
            .trim()
            .toLowerCase()
        : null;
    const { error } = await createSupabaseAdmin().rpc(
      "tttracker_v2_platform_invitation",
      {
        p_actor: actor.userId,
        p_action: action,
        p_invitation_id: invitationId,
        p_email: email,
      },
    );
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const mapped = platformErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
export async function PATCH(request: NextRequest, context: RouteContext) {
  return manage(request, context, "change_email");
}
export async function DELETE(request: NextRequest, context: RouteContext) {
  return manage(request, context, "revoke");
}

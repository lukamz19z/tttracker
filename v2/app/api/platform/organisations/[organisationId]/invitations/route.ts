import { NextRequest, NextResponse } from "next/server";

import {
  platformErrorResponse,
  requirePlatformAdmin,
} from "@/lib/platform/server";
import { sendOrganisationInvitation } from "@/lib/invitations/organisation-invite";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type RouteContext = {
  params: Promise<{
    organisationId: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const admin = await requirePlatformAdmin(["owner", "admin"]);
    const { organisationId } = await context.params;
    const body = await request.json();

    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();

    const roleId = String(body.roleId ?? "").trim();
    if (!email || !roleId)
      return NextResponse.json(
        { error: "Email and role are required." },
        { status: 400 },
      );
    const { data, error } = await createSupabaseAdmin().rpc(
      "tttracker_v2_platform_invitation",
      {
        p_actor: admin.userId,
        p_action: "create",
        p_organisation_id: organisationId,
        p_role_id: roleId,
        p_email: email,
      },
    );
    if (error || typeof data?.invitationId !== "string")
      return NextResponse.json(
        { error: error?.message ?? "Could not create invitation." },
        { status: error?.message.includes("ALREADY") ? 409 : 400 },
      );
    const invitation = { id: data.invitationId as string };

    try {
      const sent = await sendOrganisationInvitation({
        invitationId: invitation.id,
        attemptedBy: admin.userId,
      });

      return NextResponse.json(
        {
          ok: true,
          invitationId: invitation.id,
          authUserId: sent.authUserId,
        },
        { status: 201 },
      );
    } catch (sendError) {
      return NextResponse.json(
        {
          error:
            sendError instanceof Error
              ? sendError.message
              : "Invitation was created but could not be sent.",
          invitationId: invitation.id,
          recoverable: true,
        },
        { status: 400 },
      );
    }
  } catch (error) {
    const mapped = platformErrorResponse(error);

    return NextResponse.json(mapped.body, {
      status: mapped.status,
    });
  }
}

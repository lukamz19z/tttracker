import { NextRequest, NextResponse } from "next/server";

import {
  platformErrorResponse,
  requirePlatformAdmin,
} from "@/lib/platform/server";
import { sendOrganisationInvitation } from "@/lib/invitations/organisation-invite";

type RouteContext = {
  params: Promise<{
    invitationId: string;
  }>;
};

export async function POST(
  _request: NextRequest,
  context: RouteContext,
) {
  try {
    const admin = await requirePlatformAdmin(["owner", "admin"]);
    const { invitationId } = await context.params;

    const result = await sendOrganisationInvitation({
      invitationId,
      attemptedBy: admin.userId,
    });

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (error) {
    const mapped = platformErrorResponse(error);

    if (mapped.status !== 500) {
      return NextResponse.json(mapped.body, {
        status: mapped.status,
      });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not resend invitation.",
      },
      { status: 400 },
    );
  }
}

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

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    const admin = await requirePlatformAdmin(["owner", "admin"]);
    const { organisationId } = await context.params;
    const body = await request.json();

    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();

    const roleCode = String(body.roleCode ?? "")
      .trim()
      .toLowerCase();

    if (!email || !roleCode) {
      return NextResponse.json(
        { error: "Email and role are required." },
        { status: 400 },
      );
    }

    const supabase = createSupabaseAdmin();

    const { data: organisation, error: organisationError } =
      await supabase
        .from("organisations")
        .select("id, name, status")
        .eq("id", organisationId)
        .maybeSingle();

    if (organisationError || !organisation) {
      return NextResponse.json(
        {
          error:
            organisationError?.message ??
            "Organisation not found.",
        },
        { status: 404 },
      );
    }

    if (organisation.status !== "active") {
      return NextResponse.json(
        { error: "Organisation is not active." },
        { status: 400 },
      );
    }

    const { data: role, error: roleError } = await supabase
      .from("v2_roles")
      .select("id, code, name, is_active")
      .eq("organisation_id", organisationId)
      .eq("code", roleCode)
      .eq("is_active", true)
      .maybeSingle();

    if (roleError) {
      return NextResponse.json(
        { error: roleError.message },
        { status: 500 },
      );
    }

    if (!role) {
      return NextResponse.json(
        { error: "Selected role is not available for this organisation." },
        { status: 400 },
      );
    }

    const { data: existingInvitation, error: existingError } =
      await supabase
        .from("v2_organisation_invitations")
        .select("id, status")
        .eq("organisation_id", organisationId)
        .eq("email", email)
        .in("status", ["pending", "accepted"])
        .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        { error: existingError.message },
        { status: 500 },
      );
    }

    if (existingInvitation) {
      return NextResponse.json(
        {
          error:
            existingInvitation.status === "accepted"
              ? "This email already belongs to an accepted organisation user."
              : "A pending invitation already exists for this email.",
          invitationId: existingInvitation.id,
        },
        { status: 409 },
      );
    }

    const { data: invitation, error: invitationError } =
      await supabase
        .from("v2_organisation_invitations")
        .insert({
          organisation_id: organisationId,
          email,
          intended_role_code: roleCode,
          invitation_type: "organisation_user",
          status: "pending",
          invited_by: admin.userId,
          metadata: {
            source: "platform_admin",
            created_from: "organisation_detail",
          },
        })
        .select("id")
        .single();

    if (invitationError || !invitation) {
      return NextResponse.json(
        {
          error:
            invitationError?.message ??
            "Could not create invitation.",
        },
        { status: 400 },
      );
    }

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

import { NextRequest, NextResponse } from "next/server";

import {
  platformErrorResponse,
  requirePlatformAdmin,
} from "@/lib/platform/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type RouteContext = {
  params: Promise<{
    invitationId: string;
  }>;
};

function nextMetadata(
  current: unknown,
  patch: Record<string, unknown>,
) {
  const base =
    current &&
    typeof current === "object" &&
    !Array.isArray(current)
      ? (current as Record<string, unknown>)
      : {};

  return {
    ...base,
    ...patch,
  };
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    const admin = await requirePlatformAdmin(["owner", "admin"]);
    const { invitationId } = await context.params;
    const body = await request.json();

    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();

    if (!email) {
      return NextResponse.json(
        { error: "Email is required." },
        { status: 400 },
      );
    }

    const supabase = createSupabaseAdmin();

    const { data: invitation, error: invitationError } =
      await supabase
        .from("v2_organisation_invitations")
        .select(`
          id,
          organisation_id,
          email,
          status,
          auth_user_id,
          metadata
        `)
        .eq("id", invitationId)
        .maybeSingle();

    if (invitationError || !invitation) {
      return NextResponse.json(
        {
          error:
            invitationError?.message ??
            "Invitation not found.",
        },
        { status: 404 },
      );
    }

    if (invitation.status !== "pending") {
      return NextResponse.json(
        {
          error:
            "Only pending invitations can have their email changed.",
        },
        { status: 400 },
      );
    }

    if (invitation.email === email) {
      return NextResponse.json({ ok: true });
    }

    const { data: duplicate, error: duplicateError } =
      await supabase
        .from("v2_organisation_invitations")
        .select("id, status")
        .eq("organisation_id", invitation.organisation_id)
        .eq("email", email)
        .in("status", ["pending", "accepted"])
        .neq("id", invitation.id)
        .maybeSingle();

    if (duplicateError) {
      return NextResponse.json(
        { error: duplicateError.message },
        { status: 500 },
      );
    }

    if (duplicate) {
      return NextResponse.json(
        {
          error:
            "That email already has an active invitation or membership.",
        },
        { status: 409 },
      );
    }

    if (invitation.auth_user_id) {
      await supabase
        .from("v2_user_role_assignments")
        .delete()
        .eq("organisation_id", invitation.organisation_id)
        .eq("user_id", invitation.auth_user_id);

      await supabase
        .from("organisation_users")
        .delete()
        .eq("organisation_id", invitation.organisation_id)
        .eq("user_id", invitation.auth_user_id)
        .eq("status", "invited");
    }

    const metadata = nextMetadata(invitation.metadata, {
      last_email_change: {
        from: invitation.email,
        to: email,
        changed_at: new Date().toISOString(),
        changed_by: admin.userId,
      },
    });

    const { error: updateError } = await supabase
      .from("v2_organisation_invitations")
      .update({
        email,
        auth_user_id: null,
        last_sent_at: null,
        last_error: null,
        provider: null,
        provider_message_id: null,
        metadata,
      })
      .eq("id", invitation.id);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const mapped = platformErrorResponse(error);

    return NextResponse.json(mapped.body, {
      status: mapped.status,
    });
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext,
) {
  try {
    const admin = await requirePlatformAdmin(["owner", "admin"]);
    const { invitationId } = await context.params;
    const supabase = createSupabaseAdmin();

    const { data: invitation, error: invitationError } =
      await supabase
        .from("v2_organisation_invitations")
        .select(`
          id,
          organisation_id,
          status,
          auth_user_id,
          metadata
        `)
        .eq("id", invitationId)
        .maybeSingle();

    if (invitationError || !invitation) {
      return NextResponse.json(
        {
          error:
            invitationError?.message ??
            "Invitation not found.",
        },
        { status: 404 },
      );
    }

    if (invitation.status === "accepted") {
      return NextResponse.json(
        {
          error:
            "Accepted invitations cannot be cancelled. Manage the organisation user instead.",
        },
        { status: 400 },
      );
    }

    if (invitation.status === "cancelled") {
      return NextResponse.json({ ok: true });
    }

    if (invitation.auth_user_id) {
      await supabase
        .from("v2_user_role_assignments")
        .delete()
        .eq("organisation_id", invitation.organisation_id)
        .eq("user_id", invitation.auth_user_id);

      await supabase
        .from("organisation_users")
        .delete()
        .eq("organisation_id", invitation.organisation_id)
        .eq("user_id", invitation.auth_user_id)
        .eq("status", "invited");
    }

    const metadata = nextMetadata(invitation.metadata, {
      cancelled: {
        cancelled_at: new Date().toISOString(),
        cancelled_by: admin.userId,
      },
    });

    const { error: cancelError } = await supabase
      .from("v2_organisation_invitations")
      .update({
        status: "cancelled",
        last_error: null,
        metadata,
      })
      .eq("id", invitation.id);

    if (cancelError) {
      return NextResponse.json(
        { error: cancelError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const mapped = platformErrorResponse(error);

    return NextResponse.json(mapped.body, {
      status: mapped.status,
    });
  }
}

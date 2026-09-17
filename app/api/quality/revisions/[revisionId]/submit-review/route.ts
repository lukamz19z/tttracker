import { NextResponse } from "next/server";

import { notifyRevisionEvent } from "@/lib/quality/revision-notifications";
import {
  assertQualityProjectAccess,
  qualityApiError,
  requireQualityUser,
} from "@/lib/quality/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ revisionId: string }>;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { revisionId } = await context.params;
    const { service, user, role } = await requireQualityUser(request);

    const { data: revision, error } = await service
      .from("tower_revisions")
      .select("*")
      .eq("id", revisionId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!revision) {
      return NextResponse.json({ error: "Revision not found." }, { status: 404 });
    }

    await assertQualityProjectAccess({
      service,
      userId: user.id,
      role,
      projectId: revision.project_id,
    });

    const { count, error: itemError } = await service
      .from("tower_revision_items")
      .select("id", { count: "exact", head: true })
      .eq("revision_id", revisionId);

    if (itemError) throw new Error(itemError.message);
    if (!count) {
      return NextResponse.json(
        { error: "Add at least one FLI before submitting this Revision for review." },
        { status: 409 },
      );
    }

    const submittedAt = new Date().toISOString();
    const { data: updated, error: updateError } = await service
      .from("tower_revisions")
      .update({
        status: "Ready for Review",
        submitted_for_review_at: submittedAt,
        submitted_for_review_by: user.id,
        updated_at: submittedAt,
      })
      .eq("id", revisionId)
      .select("*")
      .single();

    if (updateError) throw new Error(updateError.message);

    const { data: authUser } = await service.auth.admin.getUserById(user.id);
    const actorLabel =
      clean(authUser.user?.user_metadata?.full_name) ||
      clean(authUser.user?.user_metadata?.name) ||
      clean(authUser.user?.email) ||
      "TTTracker user";

    const notification = await notifyRevisionEvent({
      service,
      revision: updated,
      event: "submitted",
      actorLabel,
    }).catch((notificationError) => ({
      recipients: 0, inApp: 0, email: 0, push: 0,
      warning: notificationError instanceof Error ? notificationError.message : "Notification warning.",
    }));

    return NextResponse.json({
      revision: updated,
      notification,
    });
  } catch (error) {
    const apiError = qualityApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

import { atomicQualityError } from "@/lib/quality/atomic-error";
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

    const {data:updated,error:updateError}=await service.rpc("finalise_v1_revision_atomic",{p_revision_id:revisionId,p_project_id:revision.project_id,p_actor_id:user.id,p_submit:true});
    if(updateError){const result=atomicQualityError(updateError);return NextResponse.json({error:result.message},{status:result.status});}
    if(revision.submitted_for_review_at)return NextResponse.json({revision:updated,notification:{recipients:0}});
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

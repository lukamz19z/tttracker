import { NextResponse } from "next/server";

import {
  canManageSitePrestarts,
  clean,
  requireSitePrestartProjectAccess,
  requireSitePrestartUser,
  sitePrestartApiError,
} from "@/lib/site-prestarts/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ prestartId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { prestartId } = await context.params;
    const { service, identity } = await requireSitePrestartUser(request);

    if (!canManageSitePrestarts(identity.role)) {
      throw new Error("MANAGE_FORBIDDEN");
    }

    const body = (await request.json()) as {
      discussionPoints?: string;
      revisionNote?: string;
      adminNotes?: string | null;
    };

    const discussionPoints = clean(body.discussionPoints);
    const revisionNote = clean(body.revisionNote);

    if (!discussionPoints) {
      return NextResponse.json(
        { error: "Enter the revised discussion points." },
        { status: 400 },
      );
    }

    const { data: prestart, error: prestartError } = await service
      .from("site_prestarts")
      .select("id,status,current_revision,admin_notes,project_id")
      .eq("id", prestartId)
      .maybeSingle();

    if (prestartError) throw new Error(prestartError.message);

    if (!prestart) {
      return NextResponse.json(
        { error: "Site Prestart could not be found." },
        { status: 404 },
      );
    }

    await requireSitePrestartProjectAccess(
      service,
      identity.userId,
      prestart.project_id,
    );

    if (prestart.status !== "draft") {
      return NextResponse.json(
        { error: "Completed Site Prestarts cannot be revised." },
        { status: 409 },
      );
    }

    const { data: currentRevision, error: currentError } = await service
      .from("site_prestart_revisions")
      .select("discussion_points")
      .eq("prestart_id", prestartId)
      .eq("revision_no", prestart.current_revision)
      .maybeSingle();

    if (currentError) throw new Error(currentError.message);

    if (clean(currentRevision?.discussion_points) === discussionPoints) {
      const { data: updated, error: updateError } = await service
        .from("site_prestarts")
        .update({
          admin_notes:
            "adminNotes" in body
              ? clean(body.adminNotes) || null
              : prestart.admin_notes,
        })
        .eq("id", prestartId)
        .select("*")
        .single();

      if (updateError) throw new Error(updateError.message);

      return NextResponse.json({
        prestart: updated,
        revisionChanged: false,
      });
    }

    const nextRevision = Number(prestart.current_revision) + 1;

    const { data: revision, error: revisionError } = await service
      .from("site_prestart_revisions")
      .insert({
        prestart_id: prestartId,
        revision_no: nextRevision,
        discussion_points: discussionPoints,
        revision_note: revisionNote || "Discussion points revised",
        created_by_user_id: identity.userId,
        created_by_name: identity.name,
      })
      .select("*")
      .single();

    if (revisionError) throw new Error(revisionError.message);

    const { data: updated, error: updateError } = await service
      .from("site_prestarts")
      .update({
        current_revision: nextRevision,
        admin_notes:
          "adminNotes" in body
            ? clean(body.adminNotes) || null
            : prestart.admin_notes,
      })
      .eq("id", prestartId)
      .select("*")
      .single();

    if (updateError) {
      await service
        .from("site_prestart_revisions")
        .delete()
        .eq("id", revision.id);
      throw new Error(updateError.message);
    }

    return NextResponse.json({
      prestart: updated,
      revision,
      revisionChanged: true,
      message:
        "Discussion points revised. Anyone who signed an earlier revision must sign the current revision before completion.",
    });
  } catch (error) {
    const apiError = sitePrestartApiError(error);

    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}

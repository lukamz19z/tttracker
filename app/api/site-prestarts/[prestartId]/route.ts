import { NextResponse } from "next/server";

import {
  canManageSitePrestarts,
  canViewSitePrestarts,
  clean,
  requireSitePrestartUser,
  sitePrestartApiError,
} from "@/lib/site-prestarts/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ prestartId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { prestartId } = await context.params;
    const { service, identity } = await requireSitePrestartUser(request);

    if (!canViewSitePrestarts(identity.role)) {
      throw new Error("VIEW_FORBIDDEN");
    }

    const { data: prestart, error: prestartError } = await service
      .from("site_prestarts")
      .select("*")
      .eq("id", prestartId)
      .maybeSingle();

    if (prestartError) throw new Error(prestartError.message);

    if (!prestart) {
      return NextResponse.json(
        { error: "Site Prestart could not be found." },
        { status: 404 },
      );
    }

    const [projectResult, revisionsResult, attendeesResult] = await Promise.all([
      service
        .from("projects")
        .select("id,name,project_number")
        .eq("id", prestart.project_id)
        .maybeSingle(),
      service
        .from("site_prestart_revisions")
        .select("*")
        .eq("prestart_id", prestartId)
        .order("revision_no", { ascending: true }),
      service
        .from("site_prestart_attendees")
        .select("*")
        .eq("prestart_id", prestartId)
        .order("signed_at", { ascending: true }),
    ]);

    if (projectResult.error) throw new Error(projectResult.error.message);
    if (revisionsResult.error) throw new Error(revisionsResult.error.message);
    if (attendeesResult.error) throw new Error(attendeesResult.error.message);

    return NextResponse.json({
      prestart: {
        ...prestart,
        project_name: projectResult.data?.name ?? null,
        project_number: projectResult.data?.project_number ?? null,
      },
      revisions: revisionsResult.data ?? [],
      attendees: attendeesResult.data ?? [],
    });
  } catch (error) {
    const apiError = sitePrestartApiError(error);

    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { prestartId } = await context.params;
    const { service, identity } = await requireSitePrestartUser(request);

    if (!canManageSitePrestarts(identity.role)) {
      throw new Error("MANAGE_FORBIDDEN");
    }

    const body = (await request.json()) as {
      adminNotes?: string | null;
      location?: string;
    };

    const { data: existing, error: existingError } = await service
      .from("site_prestarts")
      .select("id,status")
      .eq("id", prestartId)
      .maybeSingle();

    if (existingError) throw new Error(existingError.message);

    if (!existing) {
      return NextResponse.json(
        { error: "Site Prestart could not be found." },
        { status: 404 },
      );
    }

    if (existing.status !== "draft") {
      return NextResponse.json(
        { error: "Completed Site Prestarts cannot be edited." },
        { status: 409 },
      );
    }

    const patch: Record<string, unknown> = {};

    if ("adminNotes" in body) {
      patch.admin_notes = clean(body.adminNotes) || null;
    }

    if ("location" in body) {
      const location = clean(body.location);

      if (!location) {
        return NextResponse.json(
          { error: "Location cannot be blank." },
          { status: 400 },
        );
      }

      patch.location = location;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: "No changes were supplied." },
        { status: 400 },
      );
    }

    const { data: prestart, error: updateError } = await service
      .from("site_prestarts")
      .update(patch)
      .eq("id", prestartId)
      .select("*")
      .single();

    if (updateError) throw new Error(updateError.message);

    return NextResponse.json({ prestart });
  } catch (error) {
    const apiError = sitePrestartApiError(error);

    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}

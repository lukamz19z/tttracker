import { NextResponse } from "next/server";

import {
  canManageSitePrestarts,
  canViewSitePrestarts,
  clean,
  permittedSitePrestartProjectIds,
  requireSitePrestartProjectAccess,
  requireSitePrestartUser,
  sitePrestartApiError,
} from "@/lib/site-prestarts/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SitePrestartRegisterRow = {
  id: string;
  prestart_number: string;
  project_id: string;
  prestart_date: string;
  location: string;
  conducted_by_user_id: string;
  conducted_by_name: string;
  current_revision: number;
  admin_notes: string | null;
  status: string;
  completed_at: string | null;
  completed_by_name: string | null;
  pdf_file_name: string | null;
  sharepoint_web_url: string | null;
  sharepoint_sync_status: string | null;
  sharepoint_sync_error: string | null;
  created_at: string;
  updated_at: string;
};

type ProjectLookupRow = {
  id: string;
  name: string | null;
  project_number: string | null;
};

type AttendeeLookupRow = {
  prestart_id: string;
  employee_id: string;
  employee_name: string;
  discussion_revision_no: number;
};

export async function GET(request: Request) {
  try {
    const { service, identity } = await requireSitePrestartUser(request);

    if (!canViewSitePrestarts(identity.role)) {
      throw new Error("VIEW_FORBIDDEN");
    }

    const permittedProjectIds = await permittedSitePrestartProjectIds(
      service,
      identity.userId,
    );

    if (permittedProjectIds.length === 0) {
      return NextResponse.json({ prestarts: [] });
    }

    const { data: prestarts, error: prestartError } = await service
      .from("site_prestarts")
      .select(
        "id,prestart_number,project_id,prestart_date,location,conducted_by_user_id,conducted_by_name,current_revision,admin_notes,status,completed_at,completed_by_name,pdf_file_name,sharepoint_web_url,sharepoint_sync_status,sharepoint_sync_error,created_at,updated_at",
      )
      .in("project_id", permittedProjectIds)
      .order("prestart_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);

    if (prestartError) throw new Error(prestartError.message);

    const rows = (prestarts ?? []) as SitePrestartRegisterRow[];
    const projectIds = Array.from(
      new Set(
        rows
          .map((row) => clean(row.project_id))
          .filter(Boolean),
      ),
    );
    const prestartIds = rows.map((row) => row.id);

    const [projectResult, attendeeResult] = await Promise.all([
      projectIds.length
        ? service
            .from("projects")
            .select("id,name,project_number")
            .in("id", projectIds)
        : Promise.resolve({ data: [], error: null }),
      prestartIds.length
        ? service
            .from("site_prestart_attendees")
            .select("prestart_id,employee_id,employee_name,discussion_revision_no")
            .in("prestart_id", prestartIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (projectResult.error) throw new Error(projectResult.error.message);
    if (attendeeResult.error) throw new Error(attendeeResult.error.message);

    const projects =
      (projectResult.data ?? []) as ProjectLookupRow[];
    const attendees =
      (attendeeResult.data ?? []) as AttendeeLookupRow[];

    const projectById = new Map<string, ProjectLookupRow>(
      projects.map((project) => [project.id, project]),
    );

    const currentAttendeeCount = new Map<string, number>();
    const currentAttendeeNames = new Map<string, string[]>();

    const prestartById = new Map<string, SitePrestartRegisterRow>(
      rows.map((row) => [row.id, row]),
    );

    for (const attendee of attendees) {
      const prestart = prestartById.get(attendee.prestart_id);
      if (!prestart) continue;

      if (
        Number(attendee.discussion_revision_no) !==
        Number(prestart.current_revision)
      ) {
        continue;
      }

      const key = attendee.prestart_id;
      currentAttendeeCount.set(
        key,
        (currentAttendeeCount.get(key) ?? 0) + 1,
      );

      const names = currentAttendeeNames.get(key) ?? [];
      const employeeName = clean(attendee.employee_name);

      if (employeeName && !names.includes(employeeName)) {
        names.push(employeeName);
      }

      currentAttendeeNames.set(key, names);
    }

    return NextResponse.json({
      prestarts: rows.map((prestart) => {
        const project = projectById.get(prestart.project_id);

        return {
          ...prestart,
          project_name: project?.name ?? null,
          project_number: project?.project_number ?? null,
          attendee_count: currentAttendeeCount.get(prestart.id) ?? 0,
          attendee_names: currentAttendeeNames.get(prestart.id) ?? [],
        };
      }),
    });
  } catch (error) {
    const apiError = sitePrestartApiError(error);

    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}

export async function POST(request: Request) {
  try {
    const { service, identity } = await requireSitePrestartUser(request);

    if (!canManageSitePrestarts(identity.role)) {
      throw new Error("MANAGE_FORBIDDEN");
    }

    const body = (await request.json()) as {
      projectId?: string;
      prestartDate?: string;
      location?: string;
      discussionPoints?: string;
      adminNotes?: string;
    };

    const projectId = clean(body.projectId);
    const location = clean(body.location);
    const discussionPoints = clean(body.discussionPoints);
    const prestartDate =
      clean(body.prestartDate).slice(0, 10) ||
      new Date().toISOString().slice(0, 10);

    if (!projectId) {
      return NextResponse.json(
        { error: "Select a project." },
        { status: 400 },
      );
    }

    if (!location) {
      return NextResponse.json(
        { error: "Enter the site / prestart location." },
        { status: 400 },
      );
    }

    if (!discussionPoints) {
      return NextResponse.json(
        { error: "Enter the discussion points before starting." },
        { status: 400 },
      );
    }

    await requireSitePrestartProjectAccess(
      service,
      identity.userId,
      projectId,
    );

    const { data: project, error: projectError } = await service
      .from("projects")
      .select(
        "id,name,project_number,sharepoint_drive_id,sharepoint_folder_id",
      )
      .eq("id", projectId)
      .maybeSingle();

    if (projectError) throw new Error(projectError.message);

    if (!project) {
      return NextResponse.json(
        { error: "Project could not be found." },
        { status: 404 },
      );
    }

    if (!project.sharepoint_drive_id || !project.sharepoint_folder_id) {
      return NextResponse.json(
        {
          error:
            "This project is not linked to its Project Delivery SharePoint folder. Connect the project before starting a Site Prestart.",
        },
        { status: 409 },
      );
    }

    const { data: prestart, error: prestartError } = await service
      .from("site_prestarts")
      .insert({
        prestart_number: null,
        project_id: projectId,
        prestart_date: prestartDate,
        location,
        conducted_by_user_id: identity.userId,
        conducted_by_name: identity.name,
        current_revision: 1,
        admin_notes: clean(body.adminNotes) || null,
        status: "draft",
        sharepoint_sync_status: "not_published",
      })
      .select("*")
      .single();

    if (prestartError || !prestart) {
      throw new Error(
        prestartError?.message || "Site Prestart could not be created.",
      );
    }

    const { error: revisionError } = await service
      .from("site_prestart_revisions")
      .insert({
        prestart_id: prestart.id,
        revision_no: 1,
        discussion_points: discussionPoints,
        revision_note: "Initial discussion points",
        created_by_user_id: identity.userId,
        created_by_name: identity.name,
      });

    if (revisionError) {
      await service.from("site_prestarts").delete().eq("id", prestart.id);
      throw new Error(revisionError.message);
    }

    return NextResponse.json({
      prestart: {
        ...prestart,
        project_name: project.name,
        project_number: project.project_number,
      },
    });
  } catch (error) {
    const apiError = sitePrestartApiError(error);

    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}

import { NextResponse } from "next/server";

import { loadSystemPdfBranding } from "@/lib/branding/server";
import { generateSitePrestartPdf } from "@/lib/site-prestarts/pdf";
import {
  canManageSitePrestarts,
  clean,
  requireSitePrestartUser,
  sitePrestartApiError,
} from "@/lib/site-prestarts/server";
import { publishSitePrestartPdfToSharePoint } from "@/lib/site-prestarts/sharepoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ prestartId: string }>;
};

type SitePrestartService = Awaited<
  ReturnType<typeof requireSitePrestartUser>
>["service"];

type SitePrestartRow = {
  id: string;
  prestart_number: string;
  project_id: string;
  prestart_date: string;
  location: string;
  conducted_by_user_id: string;
  conducted_by_name: string;
  current_revision: number;
  admin_notes: string | null;
  status: "draft" | "completed" | "void";
  completed_at: string | null;
  completed_by_user_id: string | null;
  completed_by_name: string | null;
  pdf_file_name: string | null;
  pdf_generated_at: string | null;
  sharepoint_drive_id: string | null;
  sharepoint_folder_id: string | null;
  sharepoint_item_id: string | null;
  sharepoint_web_url: string | null;
  sharepoint_synced_at: string | null;
  sharepoint_sync_status: string | null;
  sharepoint_sync_error: string | null;
  created_at: string;
  updated_at: string;
};

type ProjectRow = {
  id: string;
  name: string;
  project_number: string | null;
  sharepoint_site_id: string | null;
  sharepoint_drive_id: string | null;
  sharepoint_folder_id: string | null;
};

type RevisionRow = {
  id: string;
  prestart_id: string;
  revision_no: number;
  discussion_points: string;
  revision_note: string | null;
  created_by_user_id: string;
  created_by_name: string;
  created_at: string;
};

type AttendeeRow = {
  id: string;
  prestart_id: string;
  discussion_revision_no: number;
  employee_id: string;
  employee_name: string;
  payroll_id: string | null;
  breathalyser_reading: number | string | null;
  declaration_text: string;
  declaration_accepted: boolean;
  signature_strokes: Array<Array<{ x: number; y: number }>>;
  signature_width: number | string | null;
  signature_height: number | string | null;
  signed_at: string;
  created_at: string;
  updated_at: string;
};

type MissingEmployeeRow = {
  id: string;
  full_name: string;
};

export async function POST(request: Request, context: RouteContext) {
  let service: SitePrestartService | null = null;
  let prestartId = "";

  try {
    const params = await context.params;
    prestartId = params.prestartId;

    const auth = await requireSitePrestartUser(request);
    service = auth.service;
    const { identity } = auth;

    if (!canManageSitePrestarts(identity.role)) {
      throw new Error("MANAGE_FORBIDDEN");
    }

    const { data: prestartData, error: prestartError } = await service
      .from("site_prestarts")
      .select("*")
      .eq("id", prestartId)
      .maybeSingle();

    const prestart =
      (prestartData ?? null) as SitePrestartRow | null;

    if (prestartError) throw new Error(prestartError.message);

    if (!prestart) {
      return NextResponse.json(
        { error: "Site Prestart could not be found." },
        { status: 404 },
      );
    }

    if (prestart.status === "completed") {
      return NextResponse.json({
        success: true,
        prestart,
        alreadyCompleted: true,
      });
    }

    if (prestart.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft Site Prestarts can be completed." },
        { status: 409 },
      );
    }

    const [projectResult, revisionsResult, attendeesResult] = await Promise.all([
      service
        .from("projects")
        .select(
          "id,name,project_number,sharepoint_site_id,sharepoint_drive_id,sharepoint_folder_id",
        )
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

    const project =
      (projectResult.data ?? null) as ProjectRow | null;
    const revisions =
      (revisionsResult.data ?? []) as RevisionRow[];
    const attendees =
      (attendeesResult.data ?? []) as AttendeeRow[];

    if (!project) {
      return NextResponse.json(
        { error: "The linked project could not be found." },
        { status: 404 },
      );
    }

    if (!project.sharepoint_drive_id || !project.sharepoint_folder_id) {
      return NextResponse.json(
        {
          error:
            "This project is not linked to its Project Delivery SharePoint folder.",
        },
        { status: 409 },
      );
    }

    const currentRevision = revisions.find(
      (revision) =>
        Number(revision.revision_no) ===
        Number(prestart.current_revision),
    );

    if (!currentRevision) {
      return NextResponse.json(
        { error: "The current discussion revision could not be found." },
        { status: 409 },
      );
    }

    const currentAttendees = attendees.filter(
      (attendee) =>
        Number(attendee.discussion_revision_no) ===
        Number(prestart.current_revision),
    );

    if (currentAttendees.length === 0) {
      return NextResponse.json(
        {
          error:
            "At least one employee must sign the current discussion revision before completion.",
        },
        { status: 409 },
      );
    }

    // If discussion points were revised after somebody signed, their earlier
    // signature cannot be represented as acceptance of the new discussion.
    // Require every person who has appeared on this prestart to acknowledge
    // the current revision before finalisation.
    const everEmployeeIds = Array.from(
      new Set(
        attendees
          .map((attendee) => clean(attendee.employee_id))
          .filter(Boolean),
      ),
    );
    const currentEmployeeIds = new Set(
      currentAttendees.map((attendee) =>
        clean(attendee.employee_id),
      ),
    );
    const missingIds = everEmployeeIds.filter(
      (employeeId) => !currentEmployeeIds.has(employeeId),
    );

    if (missingIds.length > 0) {
      const { data: missingEmployees, error: missingError } = await service
        .from("employees")
        .select("id,full_name")
        .in("id", missingIds);

      if (missingError) throw new Error(missingError.message);

      const missingEmployeeRows =
        (missingEmployees ?? []) as MissingEmployeeRow[];

      const names = missingEmployeeRows
        .map((employee) => clean(employee.full_name))
        .filter(Boolean);

      return NextResponse.json(
        {
          error: `Discussion points are now Revision ${prestart.current_revision}. The following employee${
            names.length === 1 ? "" : "s"
          } must sign the current revision before completion: ${
            names.join(", ") || "previous attendees"
          }.`,
          requiresResign: missingIds,
        },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();

    await service
      .from("site_prestarts")
      .update({
        sharepoint_sync_status: "publishing",
        sharepoint_sync_error: null,
      })
      .eq("id", prestartId);

    const branding = await loadSystemPdfBranding();

    const pdf = generateSitePrestartPdf({
      prestart: {
        ...prestart,
        completed_at: now,
      },
      project,
      currentRevision,
      revisions,
      attendees,
      branding: {
        logoDataUrl: branding.logoDataUrl,
        companyName: branding.companyName,
        abn: branding.abn,
        addressLine1: branding.addressLine1,
        addressLine2: branding.addressLine2,
        suburb: branding.suburb,
        state: branding.state,
        postcode: branding.postcode,
        phone: branding.phone,
        email: branding.email,
        website: branding.website,
      },
    });

    const published = await publishSitePrestartPdfToSharePoint({
      driveId: project.sharepoint_drive_id,
      projectFolderId: project.sharepoint_folder_id,
      prestartNumber: prestart.prestart_number,
      prestartDate: prestart.prestart_date,
      location: prestart.location,
      pdf,
    });

    const { data: completed, error: updateError } = await service
      .from("site_prestarts")
      .update({
        status: "completed",
        completed_at: now,
        completed_by_user_id: identity.userId,
        completed_by_name: identity.name,
        pdf_file_name: published.fileName,
        pdf_generated_at: now,
        sharepoint_drive_id: project.sharepoint_drive_id,
        sharepoint_folder_id: published.folder.id,
        sharepoint_item_id: published.item.id,
        sharepoint_web_url: published.item.webUrl ?? null,
        sharepoint_synced_at: now,
        sharepoint_sync_status: "published",
        sharepoint_sync_error: null,
      })
      .eq("id", prestartId)
      .select("*")
      .single();

    if (updateError) {
      throw new Error(
        `The Site Prestart PDF was uploaded to SharePoint, but TTTracker could not finalise the register row: ${updateError.message}`,
      );
    }

    return NextResponse.json({
      success: true,
      prestart: completed,
      pdf: {
        fileName: published.fileName,
        webUrl: published.item.webUrl ?? null,
      },
    });
  } catch (error) {
    if (service && prestartId) {
      try {
        await service
          .from("site_prestarts")
          .update({
            sharepoint_sync_status: "failed",
            sharepoint_sync_error:
              error instanceof Error
                ? error.message
                : "Site Prestart publication failed.",
          })
          .eq("id", prestartId)
          .eq("status", "draft");
      } catch {
        // Do not hide the original error if the diagnostic update also fails.
      }
    }

    const apiError = sitePrestartApiError(error);

    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}

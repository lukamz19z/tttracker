import { NextResponse } from "next/server";

import {
  canManageSitePrestarts,
  clean,
  requireSitePrestartProjectAccess,
  requireSitePrestartUser,
  sitePrestartApiError,
  SITE_PRESTART_DECLARATION,
} from "@/lib/site-prestarts/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ prestartId: string }>;
};

type Point = {
  x: number;
  y: number;
};

function normaliseSignature(value: unknown) {
  if (!Array.isArray(value)) return [] as Point[][];

  return value
    .slice(0, 50)
    .map((stroke) => {
      if (!Array.isArray(stroke)) return [];

      return stroke
        .slice(0, 1000)
        .map((point) => {
          if (
            typeof point !== "object" ||
            point === null ||
            !("x" in point) ||
            !("y" in point)
          ) {
            return null;
          }

          const x = Number((point as { x?: unknown }).x);
          const y = Number((point as { y?: unknown }).y);

          if (
            !Number.isFinite(x) ||
            !Number.isFinite(y) ||
            x < 0 ||
            y < 0 ||
            x > 320 ||
            y > 140
          ) {
            return null;
          }

          return { x, y };
        })
        .filter((point): point is Point => Boolean(point));
    })
    .filter((stroke) => stroke.length > 1);
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { prestartId } = await context.params;
    const { service, identity } = await requireSitePrestartUser(request);

    if (!canManageSitePrestarts(identity.role)) {
      throw new Error("MANAGE_FORBIDDEN");
    }

    const body = (await request.json()) as {
      employeeId?: string;
      breathalyserReading?: string | number | null;
      declarationAccepted?: boolean;
      signatureStrokes?: unknown;
      signatureWidth?: number;
      signatureHeight?: number;
    };

    const employeeId = clean(body.employeeId);
    const strokes = normaliseSignature(body.signatureStrokes);

    if (!employeeId) {
      return NextResponse.json(
        { error: "Select an employee." },
        { status: 400 },
      );
    }

    if (body.declarationAccepted !== true) {
      return NextResponse.json(
        { error: "The employee must accept the declaration before signing." },
        { status: 400 },
      );
    }

    if (strokes.length === 0) {
      return NextResponse.json(
        { error: "A signature is required." },
        { status: 400 },
      );
    }

    const { data: prestart, error: prestartError } = await service
      .from("site_prestarts")
      .select("id,status,current_revision,project_id")
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
        { error: "This Site Prestart is already completed." },
        { status: 409 },
      );
    }

    const { data: employee, error: employeeError } = await service
      .from("employees")
      .select("id,payroll_id,full_name,active")
      .eq("id", employeeId)
      .maybeSingle();

    if (employeeError) throw new Error(employeeError.message);

    if (!employee || employee.active === false) {
      return NextResponse.json(
        { error: "The selected employee is not active." },
        { status: 400 },
      );
    }

    let breathalyserReading: number | null = null;

    if (
      body.breathalyserReading !== null &&
      body.breathalyserReading !== undefined &&
      clean(body.breathalyserReading) !== ""
    ) {
      const parsed = Number(body.breathalyserReading);

      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
        return NextResponse.json(
          {
            error:
              "Breathalyser reading must be between 0.000 and 1.000, or left blank when not applicable.",
          },
          { status: 400 },
        );
      }

      breathalyserReading = Number(parsed.toFixed(3));
    }

    const { data: attendee, error: attendeeError } = await service
      .from("site_prestart_attendees")
      .upsert(
        {
          prestart_id: prestartId,
          discussion_revision_no: prestart.current_revision,
          employee_id: employee.id,
          employee_name: employee.full_name,
          payroll_id: clean(employee.payroll_id) || null,
          breathalyser_reading: breathalyserReading,
          declaration_text: SITE_PRESTART_DECLARATION,
          declaration_accepted: true,
          signature_strokes: strokes,
          signature_width: 320,
          signature_height: 140,
          signed_at: new Date().toISOString(),
        },
        {
          onConflict:
            "prestart_id,employee_id,discussion_revision_no",
        },
      )
      .select("*")
      .single();

    if (attendeeError) throw new Error(attendeeError.message);

    return NextResponse.json({ attendee });
  } catch (error) {
    const apiError = sitePrestartApiError(error);

    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { prestartId } = await context.params;
    const { service, identity } = await requireSitePrestartUser(request);

    if (!canManageSitePrestarts(identity.role)) {
      throw new Error("MANAGE_FORBIDDEN");
    }

    const url = new URL(request.url);
    const attendeeId = clean(url.searchParams.get("attendeeId"));

    if (!attendeeId) {
      return NextResponse.json(
        { error: "Attendee ID is required." },
        { status: 400 },
      );
    }

    const { data: prestart, error: prestartError } = await service
      .from("site_prestarts")
      .select("status,project_id")
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
        { error: "Completed Site Prestarts cannot be changed." },
        { status: 409 },
      );
    }

    const { error } = await service
      .from("site_prestart_attendees")
      .delete()
      .eq("id", attendeeId)
      .eq("prestart_id", prestartId);

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (error) {
    const apiError = sitePrestartApiError(error);

    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}
